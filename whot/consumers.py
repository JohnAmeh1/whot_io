import json

from channels.generic.websocket import AsyncWebsocketConsumer

from . import registry
from .engine import GameError, clean_name


class RoomConsumer(AsyncWebsocketConsumer):
    pid = None
    game = None

    async def connect(self):
        registry.ensure_loop()
        self.game = registry.ROOMS.get(self.scope["url_route"]["kwargs"]["code"].upper())
        await self.accept()
        if self.game is None:
            await self.send_json({"t": "gone"})
            await self.close()

    async def disconnect(self, code):
        g = self.game
        if not g or not self.pid:
            return
        g.consumers.discard(self)
        if not any(c.pid == self.pid for c in g.consumers):
            g.disconnected(self.pid)
        await registry.broadcast(g)

    async def send_json(self, data):
        await self.send(text_data=json.dumps(data))

    async def push_state(self):
        if self.pid:
            await self.send_json({"t": "state", **self.game.view(self.pid)})

    async def receive(self, text_data=None, bytes_data=None):
        g = self.game
        try:
            msg = json.loads(text_data or "")
            t = msg.get("t")
        except (ValueError, AttributeError):
            return
        if g is None:
            return
        try:
            if t == "join":
                await self._join(msg)
            elif self.pid is None:
                return
            elif t == "start":
                g.start_game(self.pid)
            elif t == "play":
                g.play(self.pid, int(msg.get("card")), msg.get("shape"))
            elif t == "draw":
                g.draw_card(self.pid)
            elif t == "bot":
                g.add_bot(self.pid)
            elif t == "kick":
                g.kick(self.pid, int(msg.get("index")))
            elif t == "sit":
                g.sit(self.pid)
            elif t == "emote":
                g.emote(self.pid, str(msg.get("key")))
            elif t == "rematch":
                g.rematch(self.pid)
            elif t == "leave":
                g.leave(self.pid)
        except GameError as e:
            await self.send_json({"t": "error", "msg": str(e)})
        except (TypeError, ValueError):
            return
        await registry.broadcast(g)

    async def _join(self, msg):
        g = self.game
        pid, name = str(msg.get("pid", ""))[:64], clean_name(msg.get("name"))
        if len(pid) < 8 or not name:
            raise GameError("Pick a username with at least 2 characters.")
        self.pid = pid
        g.consumers.add(self)
        if g.find(pid):
            g.join_player(pid, name)  # reconnecting
        elif msg.get("role") == "spectate":
            g.join_spectator(pid, name)
        else:
            try:
                g.join_player(pid, name)
            except GameError as e:  # started or full: watch instead
                g.join_spectator(pid, name)
                await self.send_json({"t": "error", "msg": str(e)})
