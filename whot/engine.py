"""Nigerian Whot rules engine. Pure Python (no Django) so it is easy to test.

Special cards
  1  Hold on       - play again
  2  Pick two      - next player picks 2 (or defends with another 2, stacking)
  5  Pick three    - next player picks 3 (or defends with another 5, stacking)
  8  Suspension    - next player misses a turn
  14 General market- everyone else picks 1, you play again
  20 Whot          - wild card, you choose the shape
"""
import random
import secrets
import time
from collections import Counter

SHAPES = ["circle", "triangle", "cross", "square", "star"]
NUMBERS = {
    "circle": [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
    "triangle": [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
    "cross": [1, 2, 3, 5, 7, 10, 11, 13, 14],
    "square": [1, 2, 3, 5, 7, 10, 11, 13, 14],
    "star": [1, 2, 3, 4, 5, 7, 8],
}
SPECIAL = {1: "Hold on", 2: "Pick two", 5: "Pick three", 8: "Suspension", 14: "General market", 20: "Whot"}
MAX_PLAYERS = 10
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I confusion
BOT_NAMES = ["Baba Ijebu", "Mama Put", "Oga Boss", "Chief Ade", "Aunty Nkechi", "Chidi", "Zainab", "Tunde", "Ngozi", "Emeka"]
EMOTES = {"clap": "👏", "laugh": "😂", "fire": "🔥", "angry": "😤", "wow": "😮", "gg": "GG 🤝"}
BOT_DELAY = 1.4        # seconds a computer "thinks"
AFK_DELAY = 7          # seconds before the computer plays for a disconnected player
LOBBY_GRACE = 20       # seconds a disconnected player is kept in the lobby
PLAYING_GRACE = 120    # seconds a disconnected player is kept mid-game


class GameError(Exception):
    """A rule was broken; the message is safe to show to players."""


def clean_name(raw):
    name = " ".join(str(raw or "").split())[:16]
    return name if len(name) >= 2 else ""


def build_deck():
    cards, i = [], 0
    for shape in SHAPES:
        for num in NUMBERS[shape]:
            cards.append({"id": i, "shape": shape, "num": num})
            i += 1
    for _ in range(5):
        cards.append({"id": i, "shape": "whot", "num": 20})
        i += 1
    return cards  # 54 cards


def card_label(c):
    return "WHOT 20" if c["shape"] == "whot" else f"{c['shape']} {c['num']}"


class Player:
    def __init__(self, pid, name, bot=False):
        self.pid, self.name, self.bot = pid, name, bot
        self.hand = []
        self.connected = True
        self.disc_at = 0.0


class Game:
    def __init__(self, code, host_pid):
        self.code, self.host = code, host_pid
        self.players, self.spectators = [], {}
        self.status = "lobby"  # lobby | playing | finished
        self.draw, self.discard = [], []
        self.turn = 0
        self.pending, self.pending_num = 0, None
        self.shape = None
        self.market_dry = False
        self.winner_name = None
        self.winner_pid = None
        self.log, self._log_id = [], 0
        self.turn_started = self.last_active = time.time()
        self.consumers = set()  # live websocket consumers (set by the server layer)

    # ---------- helpers ----------
    def touch(self):
        self.last_active = time.time()

    def say(self, text, kind="info"):
        self._log_id += 1
        self.log.append({"id": self._log_id, "text": text, "kind": kind})
        del self.log[:-40]

    def find(self, pid):
        return next((p for p in self.players if p.pid == pid), None)

    def unique_name(self, name):
        taken = {p.name.lower() for p in self.players} | {n.lower() for n in self.spectators.values()}
        base, k = name, 2
        while name.lower() in taken:
            name = f"{base} {k}"
            k += 1
        return name

    @property
    def top(self):
        return self.discard[-1] if self.discard else None

    def _is_host(self, pid):
        if pid != self.host:
            raise GameError("Only the host can do that.")

    # ---------- lobby ----------
    def join_player(self, pid, name):
        p = self.find(pid)
        if p:
            p.connected = True
            return p
        if self.status != "lobby":
            raise GameError("This game has already started, so you're spectating.")
        if len(self.players) >= MAX_PLAYERS:
            raise GameError("This room is full (10 players), so you're spectating.")
        self.spectators.pop(pid, None)
        p = Player(pid, self.unique_name(name))
        self.players.append(p)
        self.say(f"{p.name} joined the table")
        self.touch()
        return p

    def join_spectator(self, pid, name):
        if pid not in self.spectators and not self.find(pid):
            self.spectators[pid] = self.unique_name(name)
        self.touch()

    def sit(self, pid):
        if pid not in self.spectators:
            return
        name = self.spectators[pid]
        self.join_player(pid, name)

    def add_bot(self, by):
        self._is_host(by)
        if self.status != "lobby":
            raise GameError("You can only add the computer in the lobby.")
        if len(self.players) >= MAX_PLAYERS:
            raise GameError("The table is full.")
        used = {p.name for p in self.players}
        name = next((n for n in BOT_NAMES if f"{n} (CPU)" not in used), "Bot")
        p = Player("bot-" + secrets.token_hex(4), f"{name} (CPU)", bot=True)
        self.players.append(p)
        self.say(f"{p.name} sat down")

    def kick(self, by, index):
        self._is_host(by)
        if self.status != "lobby":
            raise GameError("You can only remove players in the lobby.")
        if not 0 <= index < len(self.players) or self.players[index].pid == by:
            raise GameError("You can't remove that player.")
        p = self.players.pop(index)
        self.say(f"{p.name} was removed by the host")

    # ---------- game flow ----------
    def start_game(self, by=None):
        if by is not None:
            self._is_host(by)
            if self.status != "lobby":
                raise GameError("The game has already started.")
        n = len(self.players)
        if n < 2:
            raise GameError("You need at least 2 players. Add the computer or wait for friends.")
        size = 6 if n <= 5 else 5 if n <= 7 else 4
        deck = build_deck()
        random.shuffle(deck)
        for p in self.players:
            p.hand = [deck.pop() for _ in range(size)]
        i = next(i for i, c in enumerate(deck) if c["num"] not in SPECIAL)  # plain opening card
        start = deck.pop(i)
        self.draw, self.discard, self.shape = deck, [start], start["shape"]
        self.turn = random.randrange(n)
        self.pending, self.pending_num = 0, None
        self.market_dry = False
        self.winner_name = self.winner_pid = None
        self.status = "playing"
        self.turn_started = time.time()
        self.say(f"Game on! {size} cards each. {self.players[self.turn].name} starts.", "big")
        self.touch()

    def rematch(self, by):
        self._is_host(by)
        if self.status != "finished":
            raise GameError("The game isn't over yet.")
        for p in list(self.players):
            if not p.bot and not p.connected:
                self.players.remove(p)
        self.status = "lobby"
        self.start_game()

    def playable(self, card):
        if self.pending:
            return card["num"] == self.pending_num
        return card["shape"] == "whot" or card["shape"] == self.shape or card["num"] == self.top["num"]

    def _turn_player(self, pid):
        if self.status != "playing":
            raise GameError("The game isn't running.")
        p = self.players[self.turn]
        if p.pid != pid:
            raise GameError("It's not your turn.")
        return p

    def _advance(self, skip=0):
        self.turn = (self.turn + 1 + skip) % len(self.players)
        self.turn_started = time.time()

    def _again(self):
        self.turn_started = time.time()

    def _take(self, p, k):
        got = 0
        for _ in range(k):
            if not self.draw:
                self.market_dry = True  # traditional rule: empty market ends the game
                break
            p.hand.append(self.draw.pop())
            got += 1
        return got

    def _end_market(self):
        """Market is finished: the player with the fewest cards wins (ties: lowest card total)."""
        w = min(self.players, key=lambda q: (len(q.hand), sum(c["num"] for c in q.hand)))
        self.status, self.winner_name, self.winner_pid = "finished", w.name, w.pid
        self.say(f"🏪 The market is finished! {w.name} wins with {len(w.hand)} card{'s' if len(w.hand) != 1 else ''}", "big")

    def play(self, pid, card_id, shape=None):
        p = self._turn_player(pid)
        card = next((c for c in p.hand if c["id"] == card_id), None)
        if not card:
            raise GameError("You don't have that card.")
        if not self.playable(card):
            raise GameError("That card can't be played right now.")
        if card["shape"] == "whot" and shape not in SHAPES:
            raise GameError("Choose a shape for your WHOT card.")
        p.hand.remove(card)
        self.discard.append(card)
        self.shape = shape if card["shape"] == "whot" else card["shape"]
        n = card["num"]
        self.touch()

        if not p.hand:
            self.status, self.winner_name, self.winner_pid = "finished", p.name, p.pid
            self.say(f"🏆 {p.name} played their last card and wins!", "big")
            return
        if len(p.hand) == 1:
            self.say(f"☝️ {p.name}: CHECK UP! One card left", "big")

        if n == 1:
            self.say(f"{p.name} played {card_label(card)}: hold on, plays again")
            self._again()
        elif n in (2, 5):
            self.pending += 2 if n == 2 else 3
            self.pending_num = n
            self.say(f"{p.name} played {card_label(card)}: pick {self.pending} (or defend with a {n})", "alert")
            self._advance()
        elif n == 8:
            skipped = self.players[(self.turn + 1) % len(self.players)].name
            self.say(f"{p.name} played {card_label(card)}: {skipped} is suspended", "alert")
            self._advance(skip=1)
        elif n == 14:
            for q in self.players:
                if q is not p:
                    self._take(q, 1)
            self.say(f"{p.name} played {card_label(card)}: GENERAL MARKET! Everyone picks 1", "alert")
            if self.market_dry:
                return self._end_market()
            self._again()
        elif n == 20:
            self.say(f"{p.name} played WHOT and wants {self.shape}s")
            self._advance()
        else:
            self.say(f"{p.name} played {card_label(card)}")
            self._advance()

    def draw_card(self, pid):
        p = self._turn_player(pid)
        self.touch()
        if self.pending:
            got = self._take(p, self.pending)
            self.say(f"{p.name} picked {got} card{'s' if got != 1 else ''}", "alert")
            self.pending, self.pending_num = 0, None
            if self.market_dry:
                return self._end_market()
        else:
            self._take(p, 1)
            self.say(f"{p.name} went to market")
        if self.market_dry:
            return self._end_market()
        self._advance()

    def leave(self, pid):
        if pid in self.spectators:
            del self.spectators[pid]
            return
        p = self.find(pid)
        if not p:
            return
        idx = self.players.index(p)
        self.players.pop(idx)
        self.say(f"{p.name} left the table")
        if self.status == "playing":
            self.draw = p.hand + self.draw  # their cards go to the bottom of the market
            if len(self.players) < 2:
                w = self.players[0] if self.players else None
                self.status = "finished"
                self.winner_name, self.winner_pid = (w.name, w.pid) if w else (None, None)
                if w:
                    self.say(f"🏆 {w.name} wins, everyone else left", "big")
            elif idx < self.turn:
                self.turn -= 1
            elif idx == self.turn:
                self.turn %= len(self.players)
                self.turn_started = time.time()
        if self.host == pid:
            nxt = next((q for q in self.players if not q.bot), None)
            self.host = nxt.pid if nxt else None

    def disconnected(self, pid):
        p = self.find(pid)
        if p:
            p.connected, p.disc_at = False, time.time()
        self.spectators.pop(pid, None)
        self.touch()

    def emote(self, pid, key):
        p = self.find(pid)
        name = p.name if p else self.spectators.get(pid)
        if name and key in EMOTES:
            self.say(f"{name}: {EMOTES[key]}", "chat")

    # ---------- computer player ----------
    def auto_move(self, p):
        options = [c for c in p.hand if self.playable(c)]
        if not options:
            return self.draw_card(p.pid)
        shape = None
        if self.pending:
            card = options[0]
        else:
            pool = [c for c in options if c["shape"] != "whot"] or options  # keep WHOT for emergencies
            counts = Counter(c["shape"] for c in p.hand if c["shape"] != "whot")

            def score(c):
                s = counts.get(c["shape"], 0) + (2 if c["num"] in SPECIAL else 0)
                return s + random.random()

            card = max(pool, key=score)
        if card["shape"] == "whot":
            rest = Counter(c["shape"] for c in p.hand if c is not card and c["shape"] != "whot")
            shape = rest.most_common(1)[0][0] if rest else random.choice(SHAPES)
        self.play(p.pid, card["id"], shape)

    def tick(self, now):
        """Called twice a second by the server. Returns True if anything changed."""
        changed = False
        for p in list(self.players):
            if p.bot or p.connected:
                continue
            grace = LOBBY_GRACE if self.status == "lobby" else PLAYING_GRACE
            if self.status != "finished" and now - p.disc_at > grace:
                self.leave(p.pid)
                changed = True
        if self.status == "playing" and self.players:
            p = self.players[self.turn]
            if p.bot and now - self.turn_started >= BOT_DELAY:
                self.auto_move(p)
                changed = True
            elif not p.connected and now - max(self.turn_started, p.disc_at) >= AFK_DELAY:
                self.auto_move(p)
                changed = True
        return changed

    def is_stale(self, now):
        humans = any(not p.bot for p in self.players)
        if not self.consumers and now - self.last_active > 600:
            return True
        return not humans and not self.spectators and self.status != "lobby" and not self.consumers

    # ---------- what each person is allowed to see ----------
    def view(self, pid):
        me = self.find(pid)
        host = self.find(self.host)
        order = {s: i for i, s in enumerate(SHAPES + ["whot"])}
        my_turn = self.status == "playing" and me is not None and self.players[self.turn] is me
        hand = sorted(me.hand, key=lambda c: (order[c["shape"]], c["num"])) if me else []
        return {
            "code": self.code,
            "status": self.status,
            "me": self.players.index(me) if me else None,
            "host": self.players.index(host) if host else -1,
            "players": [{"name": p.name, "bot": p.bot, "count": len(p.hand), "online": p.connected}
                        for p in self.players],
            "spectators": list(self.spectators.values()),
            "turn": self.turn if self.status == "playing" else None,
            "top": self.top,
            "shape": self.shape,
            "deck": len(self.draw),
            "pending": self.pending,
            "pendingNum": self.pending_num,
            "winner": self.winner_name,
            "iWon": bool(me and self.winner_pid == me.pid),
            "hand": hand,
            "playable": [c["id"] for c in hand if self.playable(c)] if my_turn else [],
            "log": self.log[-14:],
            "max": MAX_PLAYERS,
        }