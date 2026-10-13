# Prepared site integration

These snippets are prepared only. The site checkout has not been edited.

- Insert `tools-hub-card.html` inside the existing tools grid in `site-current/tools/index.html`, alongside Farm Records. It uses the existing tool-card/tag/link pattern. No image is supplied because a dedicated herd image has not been created.
- Insert `sitemap-entry.xml` as a sibling url block before the closing urlset in `site-current/sitemap.xml` after launch. Set lastmod to the actual publication date.
- Extract the static archive and copy the unchanged contents of its `app/` directory into `site-current/tools/herd-records/` during the authorized deployment. No files outside that directory are needed by the app shell.
- Replace every `https://github.com/workmanl/manley-farms-herd-records` placeholder after GitHub repository creation, enable private vulnerability reporting, regenerate the precache inventory, rerun tests and rebuild both archives/checksums before tagging and deploying.
- Existing donation destination verified in both local Tools and Farm Records pages: `https://buy.stripe.com/bJefZg26S8Ry99qePt8Ra03`. It is an explicit optional navigation link, never a loaded runtime resource.
- Clinical review, the multi-device pilot, lawyer review and staged browser/offline/update/print/restore checks remain gates. Keep the beta notice visible. Retain prior compatible release assets and verify the deployed version and cache scope afterwards.
