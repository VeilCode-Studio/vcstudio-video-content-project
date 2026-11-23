import { z } from "zod";
import {
  imageGenerationSizeSchema,
  imageGenerationQualitySchema,
} from "./mcp-generation";
export const studioImageRequestSchema = z.object({
  title: z.string().trim().max(200).default(""),
  prompt: z.string().trim().min(1).max(24000),
  size: imageGenerationSizeSchema,
  quality: imageGenerationQualitySchema,
  referenceAssetIds: z
    .array(z.uuid())
    .max(16)
    .refine((ids) => new Set(ids).size === ids.length)
    .default([]),
});
export type StudioImageRequest = z.infer<typeof studioImageRequestSchema>;
export const studioImageStartSchema = z.object({
  request: studioImageRequestSchema,
  quote: z.string().max(16000),
  idempotencyKey: z.uuid(),
});
export const studioImageScopeSchema = z.object({
  workspaceId: z.uuid(),
  jobId: z.uuid(),
});
export type StudioImageStatus = "queued" | "running" | "succeeded" | "failed";
export type StudioImageJob = {
  id: string;
  title: string;
  prompt: string;
  status: StudioImageStatus;
  estimatedCostCents: number;
  actualCostCents: number | null;
  error: string | null;
  createdAt: string;
  previewUrl: string | null;
  canRetry: boolean;
};

export const studioImageCursorSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

export const studioImageEditSchema = z.object({
  sourceJobId: z.uuid(),
  instructions: z
    .string()
    .trim()
    .min(1, "Describe the changes you want.")
    .max(20000),
  quality: imageGenerationQualitySchema,
});
export const studioImageEditStartSchema = z.object({
  edit: studioImageEditSchema,
  quote: z.string().max(16000),
  idempotencyKey: z.uuid(),
});
export type StudioImageEdit = z.infer<typeof studioImageEditSchema>;
