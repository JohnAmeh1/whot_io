from django.urls import path, re_path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    re_path(r"^room/(?P<code>[A-Za-z0-9]{4,8})/$", views.room, name="room"),
    path("api/rooms/create/", views.create_room, name="create_room"),
    re_path(r"^api/rooms/(?P<code>[A-Za-z0-9]{4,8})/$", views.room_info, name="room_info"),
    # PWA
    path("manifest.webmanifest", views.manifest, name="manifest"),
    path("sw.js", views.service_worker, name="sw"),
    path("offline/", views.offline, name="offline"),
]
