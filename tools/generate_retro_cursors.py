import os
from PIL import Image

def build_cursor_files(name, art_lines, hotspot_x, hotspot_y):
    h = len(art_lines)
    w = max(len(row) for row in art_lines)
    
    padded = [row.ljust(w, ' ') for row in art_lines]
    
    black_cells = []
    white_cells = []
    
    scale = 8
    img = Image.new('RGBA', (w * scale, h * scale), (0, 0, 0, 0))
    
    for y in range(h):
        for x in range(w):
            c = padded[y][x]
            if c == '1': # Black
                black_cells.append(f'M{x},{y}h1v1h-1z')
                for py in range(scale):
                    for px in range(scale):
                        img.putpixel((x*scale + px, y*scale + py), (0, 0, 0, 255))
            elif c == '2': # White
                white_cells.append(f'M{x},{y}h1v1h-1z')
                for py in range(scale):
                    for px in range(scale):
                        img.putpixel((x*scale + px, y*scale + py), (255, 255, 255, 255))
                        
    black_d = ''.join(black_cells)
    white_d = ''.join(white_cells)
    
    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" shape-rendering="crispEdges">
  <!-- 3D Enamel Rubber Pixel Badge Cursor | Hotspot: ({hotspot_x}, {hotspot_y}) -->
  <path fill="#000000" d="{black_d}"/>
  <path fill="#ffffff" d="{white_d}"/>
</svg>
'''
    
    svg_path = f'public/cursors/pixel-{name}.svg'
    png_path = f'public/cursors/pixel-{name}-preview.png'
    
    # 1x native PNG for hardware cursor performance
    img_1x = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y in range(h):
        for x in range(w):
            c = padded[y][x]
            if c == '1':
                img_1x.putpixel((x, y), (0, 0, 0, 255))
            elif c == '2':
                img_1x.putpixel((x, y), (255, 255, 255, 255))
                
    png_1x_path = f'public/cursors/pixel-{name}.png'
    img_1x.save(png_1x_path)
    
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(svg_content)
        
    img.save(png_path)
    print(f'Generated {name}: {svg_path} and {png_1x_path} (viewBox: {w}x{h}, hotspot: {hotspot_x},{hotspot_y})')

# -------------------------------------------------------------
# 1. 3D ARROW CURSOR (Direct replica of right badge in photo)
# -------------------------------------------------------------
arrow_art = [
    # 01234567890123456789012345678901
    "  1                             ", # 0 Sharp tip (hotspot: 2, 0)
    " 121                            ", # 1 White starts immediately
    "11221                           ", # 2 3D black base on left
    "112221                          ", # 3
    "1122221                         ", # 4
    "11222221                        ", # 5
    "112222221                       ", # 6
    "1122222221                      ", # 7
    "11222222221                     ", # 8
    "112222222221                    ", # 9
    "1122222222221                   ", # 10
    "11222222222221                  ", # 11
    "112222222222221                 ", # 12
    "1122222222222221                ", # 13
    "11222222222222221               ", # 14
    "112222222222222221              ", # 15
    "112222222111111111              ", # 16 Horizontal notch with 3D bottom
    "112212211111111111              ", # 17
    "1121 12211111                   ", # 18
    "111  1221                       ", # 19
    " 1    1221                      ", # 20
    "      1221                      ", # 21
    "       1221                     ", # 22
    "       1221                     ", # 23
    "        1221                    ", # 24
    "        1221                    ", # 25
    "         1221                   ", # 26
    "         1111                   ", # 27 3D bottom edge of tail
    "          111                   ", # 28
    "                                ", # 29
    "                                ", # 30
    "                                "  # 31
]

# -------------------------------------------------------------
# 2. 3D POINTING HAND CURSOR (Direct replica of left badge in photo)
# -------------------------------------------------------------
hand_art = [
    # 01234567890123456789012345678901
    "        111                     ", # 0 Index finger top cap
    "       12221                    ", # 1 Index tip (hotspot: 8, 1)
    "       12221                    ", # 2
    "       12221                    ", # 3
    "      112221                    ", # 4 Stepping slightly left as it descends
    "      112221                    ", # 5
    "      112221   1111             ", # 6 Top of middle finger
    "     1112221  122221            ", # 7
    "     1112221 11221221   1111    ", # 8 Top of ring finger
    "     1112221 11221221  122221   ", # 9
    "  111 112221 11221221 11221221  ", # 10 Top of thumb + pinky
    " 12221 12221 11221221 11221221  ", # 11
    " 122221 1221 11221221 11221221  ", # 12
    " 1122221 121 11221221 11221221  ", # 13
    "  1122221 11 11221111 11221221  ", # 14 Finger creases
    "   1122221   11221    11221221  ", # 15
    "    11222211 11221    1122121   ", # 16
    "     11222221112221   1122121   ", # 17 Thumb merges into palm
    "      1122222222221111112211    ", # 18
    "      1122222222222222222221    ", # 19 Solid palm
    "      1112222222222222222221    ", # 20
    "       112222222222222222221    ", # 21
    "       11122222222222222221     ", # 22
    "        111222222222222221      ", # 23
    "         1112222222222221       ", # 24
    "          11111111111111        ", # 25 3D rubber base bottom
    "           111111111111         ", # 26
    "            111111111           ", # 27
    "                                ", # 28
    "                                ", # 29
    "                                ", # 30
    "                                "  # 31
]

# -------------------------------------------------------------
# 3. 3D I-BEAM TEXT CURSOR (Matching retro enamel style)
# -------------------------------------------------------------
text_art = [
    # 01234567890123456789012345678901
    "                                ", # 0
    "                                ", # 1
    "                                ", # 2
    "                                ", # 3
    "       11111111111              ", # 4 Top cap
    "      1122222222221             ", # 5 White surface of top cap
    "      1111111211111             ", # 6
    "            1121                ", # 7 Stem with 3D left edge
    "            1121                ", # 8
    "            1121                ", # 9
    "            1121                ", # 10
    "            1121                ", # 11
    "            1121                ", # 12
    "            1121                ", # 13
    "            1121                ", # 14 Hotspot (12, 14)
    "            1121                ", # 15
    "            1121                ", # 16
    "            1121                ", # 17
    "            1121                ", # 18
    "            1121                ", # 19
    "            1121                ", # 20
    "      1111111211111             ", # 21
    "      1122222222221             ", # 22 Bottom cap
    "      1111111111111             ", # 23 3D bottom base
    "       11111111111              ", # 24
    "                                ", # 25
    "                                ", # 26
    "                                ", # 27
    "                                ", # 28
    "                                ", # 29
    "                                ", # 30
    "                                "  # 31
]

if __name__ == '__main__':
    os.makedirs('public/cursors', exist_ok=True)
    build_cursor_files('default', arrow_art, 2, 0)
    build_cursor_files('pointer', hand_art, 8, 1)
    build_cursor_files('text', text_art, 12, 14)
    print('Finished building pixel cursors!')
    
    print('\n=== DEFAULT ARROW (Hotspot: 2, 0) ===')
    for y, row in enumerate(arrow_art[:28]):
        r = row[:22].replace('1', '#').replace('2', '.')
        print(f'{y:02d}: {r}')
        
    print('\n=== POINTER HAND (Hotspot: 8, 1) ===')
    for y, row in enumerate(hand_art[:28]):
        r = row[:26].replace('1', '#').replace('2', '.')
        print(f'{y:02d}: {r}')

