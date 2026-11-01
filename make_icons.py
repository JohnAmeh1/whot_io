"""Regenerates the PWA icons: python make_icons.py (needs Pillow)."""
from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def draw(size, safe):
    img = Image.new("RGB", (size, size), "#0a0f24")
    d = ImageDraw.Draw(img)
    for r, col in ((0.62, "#0b6b45"), (0.46, "#0e8a58")):  # felt glow
        c = size / 2
        d.ellipse([c - size * r, c - size * r, c + size * r, c + size * r], fill=col)
    w, h = size * safe * 0.56, size * safe * 0.78
    x0, y0 = (size - w) / 2, (size - h) / 2
    d.rounded_rectangle([x0, y0 + size * 0.02, x0 + w, y0 + h + size * 0.02], size * 0.07, fill="#05301f")  # shadow
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], size * 0.07, fill="#e8283a", outline="#ffc83d", width=max(3, size // 48))
    f = ImageFont.truetype(FONT, int(size * safe * 0.27))
    d.text((size / 2, size / 2 - size * 0.02), "W", font=f, fill="#fff7e6", anchor="mm")
    f2 = ImageFont.truetype(FONT, int(size * safe * 0.085))
    d.text((size / 2, y0 + h * 0.84), "WHOT", font=f2, fill="#ffc83d", anchor="mm")
    return img


draw(512, 1.0).save("static/icons/icon-512.png")
draw(512, 1.0).resize((192, 192), Image.LANCZOS).save("static/icons/icon-192.png")
draw(512, 0.78).save("static/icons/maskable-512.png")  # content inside the 80% safe zone
draw(512, 1.0).resize((180, 180), Image.LANCZOS).save("static/icons/apple-touch-icon.png")
