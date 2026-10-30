# @ant.ms/showly-providers

High-reliability Western movies & TV shows streaming provider resolvers, scrapers, and stream quality verifiers for Showly.

## Providers Benchmark & Status

| Provider      | Base URL                         | Average Latency | Status | CDN / Infrastructure | Direct HLS            |
| :------------ | :------------------------------- | :-------------- | :----- | :------------------- | :-------------------- |
| **VidApi**    | `https://streamdata.vaplayer.ru` | ~60ms           | 200 OK | Cloudflare           | Yes (1080p M3U8)      |
| **VixSrc**    | `https://vixsrc.to`              | ~180ms          | 200 OK | VixCloud             | Yes (1080p M3U8)      |
| **Zoechip**   | `https://zoechip.bz`             | ~71ms           | 200 OK | Cloudflare           | VixCloud / Direct HLS |
| **HiMovies**  | `https://himovies.ac`            | ~95ms           | 200 OK | Cloudflare           | VixCloud / Direct HLS |
| **MoviesJoy** | `https://moviesjoy.bz`           | ~100ms          | 200 OK | Cloudflare           | VixCloud / Direct HLS |

## Installation

```bash
pnpm add @ant.ms/showly-providers
```

## Quick Start

```typescript
import { registry, probeStreamHealth } from "@ant.ms/showly-providers";

// 1. Check available streaming servers for a movie or TV show
const services = await registry.checkAvailability("Oppenheimer", 2023);

console.log(`Found ${services.length} available service candidates:`);
console.log(services[0]); // Best-scoring server (e.g. VidApi 1080p)

// 2. Resolve stream URL
const stream = await registry.resolveStream(
  services[0].providerId,
  services[0].identifier,
  1, // Episode (for TV)
  1, // Season (for TV)
  services[0].serverName,
);

// 3. Pre-flight probe stream health before handing to player
const isHealthy = await probeStreamHealth(stream);
console.log("Stream health:", isHealthy ? "OK" : "Stalled");
```

## Scripts

- `pnpm run build`: Build CJS, ESM, and DTS bundles via `tsup`.
- `pnpm test`: Run unit test suite via `vitest`.
- `pnpm run test:coverage`: Run coverage reports.
- `pnpm run check`: Typecheck with `tsc --noEmit`.

## License

MIT © Yanik Ammann
