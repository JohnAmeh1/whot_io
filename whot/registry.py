"""In-memory room registry + the background loop that drives computer players.

Rooms live in this process's memory, so run ONE server process (one daphne worker).
"""
import asyncio
import logging
import secrets
import time

from .engine import CODE_ALPHABET, Game

log = logging.getLogger(__name__)
ROOMS: dict[str, Game] = {}
MAX_ROOMS = 500
_task = None


def new_code():
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(5))
        if code not in ROOMS:
            return code


def create(host_pid, host_name, bots=0):
    """Create a room with the host seated. bots > 0 means 'play vs computer': deal straight away."""
    if len(ROOMS) >= MAX_ROOMS:
        return None
    game = Game(new_code(), host_pid)
    host = game.join_player(host_pid, host_name)
    host.connected, host.disc_at = False, time.time()  # becomes True when their page connects
    for _ in range(bots):
        game.add_bot(host_pid)
    if bots:
        game.start_game(host_pid)
    ROOMS[game.code] = game
    return game


async def broadcast(game):
    await asyncio.gather(*(c.push_state() for c in list(game.consumers)), return_exceptions=True)


async def _run():
    while True:
        await asyncio.sleep(0.5)
        now = time.time()
        for code, game in list(ROOMS.items()):
            try:
                if game.tick(now):
                    await broadcast(game)
                if game.is_stale(now):
                    ROOMS.pop(code, None)
            except Exception:  # never let one room kill the loop
                log.exception("room %s failed", code)
                ROOMS.pop(code, None)


def ensure_loop():
    global _task
    loop = asyncio.get_running_loop()
    if _task is None or _task.done() or _task.get_loop() is not loop:
        _task = loop.create_task(_run())
