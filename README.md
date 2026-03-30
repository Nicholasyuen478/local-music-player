# Audio Shuffle Manager

Mono-repo for the Audio Shuffle Manager app and supporting services.

## Overview

- `artifacts/mobile`: Expo React Native app for managing audio, playlists, shuffling, and cropping track artwork.
- `artifacts/api-server`: Express/Drizzle API for backend features.
- `lib/api-client-react`, `lib/api-zod`, `lib/db`: shared libraries for API clients, schema types, and DB schema.
- `scripts`: utility scripts and tooling logic.

## Key Features

- Expo Router integrated mobile app with tabs for images and library.
- Image cropper (`components/CropModal.tsx`) with pinch/drag, double-tap reset, and correct EXIF-safe scaling.
- Backend API routes under `artifacts/api-server/src/routes` for health and core endpoints.
- Shared db schema via `lib/db/src/schema` and generated type-safe API from `lib/api-zod`.

## Requirements

- Node.js 18+ (recommended)
- `pnpm` package manager
- (mobile) `expo` CLI

## Setup

```bash
pnpm install
```

## Development

### Run mobile app

```bash
cd artifacts/mobile
pnpm install
pnpm dev
```

### Build mobile app

```bash
cd artifacts/mobile
pnpm build
pnpm serve
```

### Run API server

```bash
cd artifacts/api-server
pnpm install
pnpm dev
```

### Typecheck everything

```bash
pnpm typecheck
```

## Testing

This repo does not include dedicated unit tests in the current state. Add your own test setups as needed (e.g. Jest, Vitest).

## Directory Structure

- `artifacts/mobile/app` — Expo router pages
- `artifacts/mobile/components` — UI components (CropModal, etc.)
- `artifacts/mobile/utils` — helper utilities
- `artifacts/api-server/src` — Express app, routes, middleware
- `lib/db` — DB schema and config
- `lib/api-zod`, `lib/api-client-react` — generated API types/clients

## Contributing

1. Fork
2. Create branch: `feature/your-feature`
3. Add/update code
4. Test locally
5. Open PR

## Contact

For questions, use repository issues or reach the maintainer.
# local-music-player
