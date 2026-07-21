# Changelog

## 3.76.0-task-image-previews — 2026-07-21

### Added

- Added clear attachment-count indicators and larger image previews to Full/PC task surfaces.
- Added Mobile task-card attachment badges, a non-image paperclip fallback, and a lazy-loaded image gallery in the task editor.
- Added keyboard activation and accessible labels to Full/PC attachment preview controls.

### Security and compatibility

- Mobile previews continue to accept only sanitized image URLs and open previews with opener isolation.
- Preserved the version 3.75 unified sync-conflict workflow, Google Drive/Supabase integrations, version 7 profile compatibility, and existing task data.
- Recalculated inline-script CSP hashes and refreshed the build manifest.

## 3.75.0-unified-sync-conflicts — 2026-07-21

### Added

- Unified the Full/PC and Mobile Google Drive conflict workflow.
- Compared Cloud and Local timestamps, marked the newer copy, and recommended the newer-to-older direction.
- Kept both **Cloud → Local** and **Local → Cloud** actions available and added a separate final overwrite confirmation.
- Added image thumbnails to timeline/mobile task cards when an attachment is an image.

### Changed

- Renamed storage actions to **Save to Cloud**, **Open Local File**, **Backup to Local Drive**, and **Restore from Local File**.
- Preserved automatic Drive metadata checks on focus, visibility change, reconnect, and scheduled sync so Full/PC and Mobile detect one another's cloud writes.
- Recalculated inline-script CSP hashes and refreshed the build manifest.

### Security and compatibility

- Preserved the Google Drive `drive.file` OAuth scope, Supabase authentication, CSP restrictions, URL sanitization, security hardening, and version 7 profile compatibility.
- Image thumbnails accept only the existing sanitized image sources and are lazy-loaded.
