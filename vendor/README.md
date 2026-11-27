# Vendored third-party files

- `peerjs.min.js`: PeerJS v1.5.5 (MIT, see `PEERJS-LICENSE`), from `https://registry.npmjs.org/peerjs/-/peerjs-1.5.5.tgz`
  (`dist/peerjs.min.js`, original sha256 `7604d8c31bec4f134b0d15c2d80b1d095ea18af005354f439f14291fcd7b4168`).
  The only change is removing the trailing `//# sourceMappingURL` comment, so browsers don't request a missing map file.
  Used only by the optional linked host-phone mode (`docs/briefs/02-host-phone.md`). Do not load PeerJS from a CDN.
