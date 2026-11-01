# whot_io: Nigerian Whot online (Django + WebSockets + PWA)

## Run it
```bash
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py runserver 0.0.0.0:8000              # daphne is installed, so runserver speaks WebSockets
```
Open http://localhost:8000. To test on your phone, open `http://<your-computer-ip>:8000` on the same Wi-Fi
(the game works, but "Install app" needs HTTPS, see below).

## How it plays
- Pick a username, **Host a game**, share the 5-letter room code (or the Share button).
- Up to **10 players** per room. The host can add computer players and starts the game.
- **Watch** with a room code to spectate. People who join a game already in progress spectate automatically.
- **Play the computer** deals instantly against 1 to 5 computer opponents.
- Disconnected players are covered by the computer after 7 seconds, and removed after 2 minutes.

## PWA
`/manifest.webmanifest` and `/sw.js` are served by Django. Browsers only offer **Install** on **HTTPS**
(localhost is the exception). Deploy behind HTTPS, then use "Install app" on the home page (Android/Chrome)
or Share → Add to Home Screen (iPhone).

## Deploy
```bash
export DJANGO_DEBUG=0 DJANGO_SECRET_KEY='long-random-string' DJANGO_ALLOWED_HOSTS='yourdomain.com'
export DJANGO_CSRF_TRUSTED_ORIGINS='https://yourdomain.com'
python manage.py collectstatic --noinput
daphne -b 0.0.0.0 -p 8000 whot_io.asgi:application
```
**Run a single process.** Rooms live in memory (`whot/registry.py`), so don't use several workers. A restart ends live games.
To scale beyond one process later, move room state into Redis.

## Layout
- `whot/engine.py` Whot rules + computer player (no Django, easy to test)
- `whot/consumers.py`, `whot/registry.py` WebSocket handling and the game loop
- `templates/`, `static/` UI; `make_icons.py` regenerates the app icons
