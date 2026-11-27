# Vendored third-party files

- `peerjs.min.js`: PeerJS v1.5.5 (MIT, see `PEERJS-LICENSE`), from `https://registry.npmjs.org/peerjs/-/peerjs-1.5.5.tgz`
  (`dist/peerjs.min.js`, original sha256 `7604d8c31bec4f134b0d15c2d80b1d095ea18af005354f439f14291fcd7b4168`).
  The only change is removing the trailing `//# sourceMappingURL` comment, so browsers don't request a missing map file.
  Used only by the optional linked host-phone mode (`docs/briefs/02-host-phone.md`). Do not load PeerJS from a CDN.

- `qrcode-generator.min.js`: qrcode-generator 1.4.4 (MIT, see `QRCODE-GENERATOR-LICENSE`), from
  `https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-1.4.4.tgz` (`qrcode.js`,
  original sha256 `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780`).
  Minified with terser (`-c -m`); no other source changes. Minified sha256
  `d8ce08e2791106683ec56b46a04d3634e7454980972abb77b1cc8c955bfcc7d4`.
  Used only to draw the host-phone QR code on the stage. Do not load it from a CDN.
