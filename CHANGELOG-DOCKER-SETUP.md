# Changelog — VS Code Docker setup patch

- Added `scripts/setup-env.ps1` to generate five unique secrets locally and populate `.env`.
- Updated `.env.example` with explicit setup-script placeholders and secret separation.
- Added Windows/VS Code setup, run, verification, URL, credential-location, and safe-stop instructions to `README.md`.
- Preserved existing Docker Compose services, application source, and named volumes.
- Did not include `.env` or any generated secrets in this archive.
