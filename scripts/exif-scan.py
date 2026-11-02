"""Midlertidig, kun læsning: hvor mange originaler i bike-images har EXIF/GPS?

Henter kun de første 128 KB af hver fil (Range-header). Ændrer intet.
Loggen er offentlig, så den viser KUN tællinger. Listen over filer med GPS
krypteres med en offentlig nøgle, så kun den der har den private nøgle kan
læse hvilke filer det drejer sig om. Koordinater læses aldrig ud.
"""
import json, struct, sys, urllib.parse, urllib.request

BUCKET = 'bike-images'

def req(url, data=None, headers=None):
    r = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(r, timeout=60) as f:
        return f.read()

def list_all(prefix=''):
    out, offset = [], 0
    while True:
        body = json.dumps({'prefix': prefix, 'limit': 1000, 'offset': offset}).encode()
        rows = json.loads(req(f'{URL}/storage/v1/object/list/{BUCKET}', body,
            {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}))
        for r in rows:
            name = f'{prefix}{r["name"]}'
            if r.get('id') is None: out += list_all(name + '/')   # mappe
            else: out.append(name)
        if len(rows) < 1000: return out
        offset += 1000

def tiff_info(t):
    """(har_exif_felter, har_gps_blok, har_gps_position) fra en TIFF-blok."""
    if len(t) < 8: return (False, False, False)
    e = '<' if t[:2] == b'II' else '>'
    def ifd(off):
        tags = {}
        if off + 2 > len(t): return tags
        n = struct.unpack(e + 'H', t[off:off+2])[0]
        for i in range(n):
            p = off + 2 + i * 12
            if p + 12 > len(t): break
            tag, typ, cnt = struct.unpack(e + 'HHI', t[p:p+8])
            tags[tag] = struct.unpack(e + 'I', t[p+8:p+12])[0]
        return tags
    ifd0 = ifd(struct.unpack(e + 'I', t[4:8])[0])
    meta = any(k in ifd0 for k in (0x010F, 0x0110, 0x0132, 0x8769))  # Make, Model, DateTime, ExifIFD
    if 0x8825 not in ifd0: return (meta or bool(ifd0), False, False)
    gps = ifd(ifd0[0x8825])
    return (True, True, 2 in gps and 4 in gps)   # GPSLatitude + GPSLongitude

def find_tiff(b):
    if b[:2] == b'\xff\xd8':                      # JPEG: APP1 "Exif\0\0"
        i = 2
        while i + 4 <= len(b) and b[i] == 0xFF:
            m = b[i+1]; ln = struct.unpack('>H', b[i+2:i+4])[0]
            if m == 0xE1 and b[i+4:i+10] == b'Exif\x00\x00': return b[i+10:i+2+ln]
            if m == 0xDA: break
            i += 2 + ln
        return None
    if b[:8] == b'\x89PNG\r\n\x1a\n':              # PNG: eXIf-chunk
        i = 8
        while i + 8 <= len(b):
            ln = struct.unpack('>I', b[i:i+4])[0]; typ = b[i+4:i+8]
            if typ == b'eXIf': return b[i+8:i+8+ln]
            if typ == b'IDAT': break
            i += 12 + ln
        return None
    if b[:4] == b'RIFF' and b[8:12] == b'WEBP':    # WebP: EXIF-chunk
        i = 12
        while i + 8 <= len(b):
            typ = b[i:i+4]; ln = struct.unpack('<I', b[i+4:i+8])[0]
            if typ == b'EXIF':
                c = b[i+8:i+8+ln]
                return c[6:] if c[:6] == b'Exif\x00\x00' else c
            i += 8 + ln + (ln & 1)
        return None
    return None

def classify(b):
    t = find_tiff(b)
    if t is None: return 'ren'
    meta, gpsblok, pos = tiff_info(t)
    if pos: return 'gps'
    if gpsblok: return 'gps_uden_position'
    return 'anden_exif' if meta else 'ren'

if __name__ == '__main__':
    URL, KEY = sys.argv[1], sys.argv[2]
    names = [n for n in list_all() if '-thumb' not in n]
    counts, gps, fejl = {}, [], 0
    for n in names:
        try:
            b = req(f'{URL}/storage/v1/object/public/{BUCKET}/{urllib.parse.quote(n)}',
                    headers={'Range': 'bytes=0-131071'})
            c = classify(b)
        except Exception:
            c = 'kunne_ikke_hentes'
        counts[c] = counts.get(c, 0) + 1
        if c in ('gps', 'gps_uden_position'): gps.append([n, c])
    print('ORIGINALER I ALT:', len(names))
    for k, v in sorted(counts.items()): print(f'  {k}: {v}')
    open('gps-liste.json', 'w').write(json.dumps(gps))
