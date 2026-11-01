import json

from django.http import JsonResponse
from django.shortcuts import render
from django.templatetags.static import static
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from . import registry
from .engine import MAX_PLAYERS, clean_name


def home(request):
    return render(request, "home.html")


def room(request, code):
    return render(request, "room.html", {"code": code.upper()})


def offline(request):
    return render(request, "offline.html")


@csrf_exempt  # anonymous API: no cookies or sessions are used, identity is a random token held by the player
@require_POST
def create_room(request):
    try:
        data = json.loads(request.body or b"{}")
    except ValueError:
        return JsonResponse({"error": "Bad request."}, status=400)
    pid, name = str(data.get("pid", ""))[:64], clean_name(data.get("name"))
    if len(pid) < 8 or not name:
        return JsonResponse({"error": "Pick a username with at least 2 characters."}, status=400)
    bots = 0
    if data.get("mode") == "cpu":
        try:
            bots = min(max(int(data.get("bots", 1)), 1), MAX_PLAYERS - 1)
        except (TypeError, ValueError):
            bots = 1
    game = registry.create(pid, name, bots)
    if game is None:
        return JsonResponse({"error": "The server is busy. Try again in a minute."}, status=503)
    return JsonResponse({"code": game.code})


@require_GET
def room_info(request, code):
    game = registry.ROOMS.get(code.upper())
    if not game:
        return JsonResponse({"exists": False})
    return JsonResponse({
        "exists": True,
        "status": game.status,
        "players": len(game.players),
        "spectators": len(game.spectators),
        "full": len(game.players) >= MAX_PLAYERS,
    })


def manifest(request):
    data = {
        "name": "whot_io: Nigerian Whot",
        "short_name": "whot_io",
        "description": "Play Nigerian Whot online with friends, spectate, or play the computer.",
        "id": "/",
        "start_url": "/?source=pwa",
        "scope": "/",
        "display": "standalone",
        "orientation": "any",
        "background_color": "#0a0f24",
        "theme_color": "#0a0f24",
        "categories": ["games"],
        "icons": [
            {"src": static("icons/icon-192.png"), "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": static("icons/icon-512.png"), "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": static("icons/maskable-512.png"), "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    return JsonResponse(data, content_type="application/manifest+json")


def service_worker(request):
    resp = render(request, "sw.js", content_type="application/javascript")
    resp["Service-Worker-Allowed"] = "/"
    resp["Cache-Control"] = "no-cache"
    return resp
