# Herd Records updates link, 1.3.2-beta.1

The private-origin public intro has an updates card after the FAQ and a footer link. Both navigate to https://manleyfarms.com/herd-records-updates/?from=app with rel="noopener" and no target. The existing body copy is retained. Record-entry routes and the moved build hide both links.

Signing up happens on manleyfarms.com. This app never sends your email or herd records anywhere. The capture module is removed. Runtime connections remain local, and both HTML and hosting CSP retain connect-src 'self'. The service worker fetches only local inventoried assets.

Tests cover exact links, placement, route visibility, both release configurations, privacy disclosures, local assets and CSP. Build and release scripts regenerate inventories, ZIPs and checksums locally. Main-site signup availability and browser/device checks remain unverified. No git, deploy or network operations were performed.
