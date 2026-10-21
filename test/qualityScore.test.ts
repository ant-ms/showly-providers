import { describe, it, expect } from "vitest";
import {
  getContainerScore,
  getLatencyScore,
  getResolutionScore,
  getServiceScore,
  getStreamScore,
  parseQualityString,
  SCORE_WEIGHT_1080P,
  SCORE_WEIGHT_4K,
  SCORE_WEIGHT_720P,
  SCORE_WEIGHT_HLS,
  SCORE_WEIGHT_MP4,
  SCORE_WEIGHT_PROVIDER_NOVA,
} from "../src/qualityScore.js";
import type { AvailableService, StreamSource } from "../src/types.js";

describe("qualityScore", () => {
  describe("resolution scoring", () => {
    it("correctly parses quality strings", () => {
      expect(parseQualityString("4K")).toBe(2160);
      expect(parseQualityString("1080p")).toBe(1080);
      expect(parseQualityString("720p")).toBe(720);
      expect(parseQualityString("HD")).toBe(1080);
      expect(parseQualityString("480p")).toBe(480);
    });

    it("ranks 4K > 1080p > 720p > 480p", () => {
      expect(getResolutionScore(2160)).toBe(SCORE_WEIGHT_4K);
      expect(getResolutionScore(1080)).toBe(SCORE_WEIGHT_1080P);
      expect(getResolutionScore(720)).toBe(SCORE_WEIGHT_720P);
      expect(getResolutionScore("1080p")).toBeGreaterThan(
        getResolutionScore("720p"),
      );
    });
  });

  describe("container scoring", () => {
    it("scores HLS higher than MP4", () => {
      expect(getContainerScore("hls", "https://site.com/master.m3u8")).toBe(
        SCORE_WEIGHT_HLS,
      );
      expect(getContainerScore("mp4", "https://site.com/video.mp4")).toBe(
        SCORE_WEIGHT_MP4,
      );
      expect(getContainerScore("hls")).toBeGreaterThan(
        getContainerScore("mp4"),
      );
    });
  });

  describe("latency scoring", () => {
    it("rewards low latency and penalizes excessive latency", () => {
      expect(getLatencyScore(50)).toBe(6);
      expect(getLatencyScore(200)).toBe(4);
      expect(getLatencyScore(500)).toBe(2);
      expect(getLatencyScore(1200)).toBe(0);
      expect(getLatencyScore(2500)).toBe(-4);
    });
  });

  describe("getServiceScore", () => {
    it("prioritizes NovaHD Falcon server over lower ranked providers", () => {
      const novaFalcon: AvailableService = {
        providerId: "nova",
        providerName: "NovaHD",
        serverName: "Falcon · 1080p",
        serverId: "falcon",
        mediaType: "movie",
        identifier: "movie:872585",
        quality: "1080p",
      };

      const genericService: AvailableService = {
        providerId: "unknown",
        providerName: "Unknown",
        serverName: "Server 1",
        serverId: "s1",
        mediaType: "movie",
        identifier: "1",
        quality: "720p",
      };

      expect(getServiceScore(novaFalcon)).toBeGreaterThan(
        getServiceScore(genericService),
      );
      expect(getServiceScore(novaFalcon)).toBeGreaterThanOrEqual(
        SCORE_WEIGHT_PROVIDER_NOVA + SCORE_WEIGHT_1080P,
      );
    });
  });

  describe("getStreamScore", () => {
    it("calculates comprehensive stream score with bonus, resolution, container and latency", () => {
      const stream: StreamSource = {
        url: "https://nova.cc/master.m3u8",
        container: "hls",
        quality: "1080p",
        subtitles: [{ label: "EN", language: "en", url: "https://subs.vtt" }],
      };

      const score = getStreamScore(stream, 75, 10);
      // providerBonus(10) + res(10) + hls(8) + latency(6) + subs(2) = 36
      expect(score).toBe(36);
    });
  });
});
