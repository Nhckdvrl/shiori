# Bundled interface fonts

## Smiley Sans (headings)

Copyright (c) 2022--2024, atelierAnchor.
Official source: https://github.com/atelier-anchor/smiley-sans
Release: v2.0.1, https://github.com/atelier-anchor/smiley-sans/releases/tag/v2.0.1
License: SIL Open Font License 1.1, retained in OFL-SmileySans.txt.

SmileySans.woff2 is the unmodified SmileySans-Oblique.ttf.woff2 from the official release archive. The font has a native slant; the application does not synthesize bold or italic. Used only for page headings and the home banner; game names, buttons and body text retain MiSans.

SHA-256:

    SmileySans.woff2: 731f22973349404b15a88a99ef3b5dd4104c0965c23b7e485c1f11e84fea99e2
    OFL-SmileySans.txt: 9401f4050f1b66c26b6ccdc8b0e14a3c1cc37aac122eda84386f25854a9bec72

## MiSans

Copyright: Xiaomi Inc.

Official source: https://hyperos.mi.com/font/zh/
Download: https://hyperos.mi.com/font-download/MiSans.zip
License: MiSans Font Intellectual Property License Agreement, retained verbatim in MiSans-LICENSE.pdf. This custom font license is separate from Shiori's MIT license.
License source: https://hyperos.mi.com/font-download/MiSans%E5%AD%97%E4%BD%93%E7%9F%A5%E8%AF%86%E4%BA%A7%E6%9D%83%E8%AE%B8%E5%8F%AF%E5%8D%8F%E8%AE%AE.pdf

The four WOFF2 files are unmodified originals from the official archive's MiSans/woff2/ directory, including their copyright records. They are bundled as part of this application, not distributed as a standalone font product. The interface identifies MiSans in Preferences. No system font installation or online font request is needed.

SHA-256:

    MiSans-Regular.woff2: d704c1a932c0bd7e8a071d276cd81c0ed0c9fecfa26ac234f4bed0559fe1cb2d
    MiSans-Medium.woff2: 44e28ca6c2f0ca79829f192831ef87b5eec7c464f5cfb7a83467f57bb6e58114
    MiSans-Demibold.woff2: 7afe3737efaf6a137db0ef4857fbe4033a8802756485ebc7f008e96a4bdedcf2
    MiSans-Bold.woff2: 1c5a7515b61bc82baaa2e2c2fdae2032479fb9a99e09d4d021dc17314fc5939b
    MiSans-LICENSE.pdf: 4a93a27cd2bd81b3b5ecfd0a853144a876fa26938a93a68443c67d74172fcb86

## Noto Sans SC (fallback)

Source: https://github.com/google/fonts/tree/main/ofl/notosanssc
Upstream project: https://github.com/notofonts/noto-cjk
License: SIL Open Font License 1.1, see OFL-NotoSansSC.txt.

The full upstream variable TTF was converted to WOFF2 using fontTools. Glyphs, character coverage and font names were retained; no UI-only subset is used, so game titles can use the same font offline.

Upstream file: NotoSansSC[wght].ttf
TTF SHA-256: a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da
WOFF2 SHA-256: 808c9776f3c76aa159b19fd8f8ffa970a619dfe8f0e88feb62fe5f0203177033

Rebuild with fontTools and Brotli available:

    from fontTools.ttLib import TTFont
    font = TTFont('NotoSansSC[wght].ttf')
    font.flavor = 'woff2'
    font.save('NotoSansSC-VF.woff2')
