import { z } from 'zod';

export const ThemeIdSchema = z.enum([
  'editing-room',
  'daylight-editorial',
  'creator-tactile'
]);
export type ThemeId = z.infer<typeof ThemeIdSchema>;

export const AiProviderSchema = z.enum([
  'gemini',
  'openai',
  'anthropic',
  'openrouter',
  'groq',
  'deepgram'
]);
export type AiProvider = z.infer<typeof AiProviderSchema>;

export const AiKeyRoleSchema = z.enum(['brain', 'stt', 'tts']);
export type AiKeyRole = z.infer<typeof AiKeyRoleSchema>;

export const PlatformTargetSchema = z.enum([
  'tiktok',
  'youtube_shorts',
  'youtube_long'
]);
export type PlatformTarget = z.infer<typeof PlatformTargetSchema>;

export const MasterPresetCategorySchema = z.enum([
  'country',
  'age_group',
  'editing_style',
  'hook_type',
  'controversy_level',
  'framing_mode',
  'prompt_preset'
]);
export type MasterPresetCategory = z.infer<typeof MasterPresetCategorySchema>;

export const BriefRulebookSchema = z.object({
  campaignGoal: z.string().min(1),
  targetPlatforms: z.array(PlatformTargetSchema).min(1),
  durationRules: z.object({
    minSec: z.number().min(5).max(3600),
    maxSec: z.number().min(5).max(3600),
    idealSec: z.number().min(5).max(3600).optional()
  }),
  mandatoryDos: z.array(z.string()),
  strictDonts: z.array(z.string()),
  requiredHashtags: z.array(z.string()),
  requiredMentions: z.array(z.string()),
  brandTone: z.string().min(1)
});
export type BriefRulebook = z.infer<typeof BriefRulebookSchema>;

export const TargetConfigSchema = z.object({
  platform: PlatformTargetSchema,
  countryCode: z.string().min(2).max(10),
  languageStyle: z.string().min(2).max(80),
  ageGroup: z.string().min(2).max(40),
  genderFocus: z.enum(['all', 'male', 'female']).default('all'),
  personaNiche: z.string().min(2).max(120),
  controversyLevel: z.enum([
    'safe_edu',
    'bold_opinion',
    'hot_take',
    'controlled_debate'
  ]),
  hookType: z.string().min(2).max(60),
  emotionalTrigger: z.string().min(2).max(60),
  primaryKpi: z.enum(['watch_time', 'comments', 'shares', 'clicks']),
  editingStyle: z.string().min(2).max(60),
  framingMode: z.enum(['center_crop', 'fit_blur_bg', 'split_screen']).default('fit_blur_bg'),
  captionStyle: z.enum(['hormozi_bold', 'clean_minimal', 'bilingual', 'off']),
  initialAudioMode: z.enum([
    'original_normalized',
    'ducking_20',
    'mute_for_platform_sound'
  ]),
  batchDiversityMode: z.enum(['distinct_moments', 'ab_hook_test']).default('distinct_moments'),
  batchCount: z.number().int().min(1).max(10),
  referencePacingId: z.string().nullable().optional(),
  supportingAssets: z.object({
    watermarkAssetId: z.string().nullable().optional(),
    outroAssetId: z.string().nullable().optional()
  }).optional()
});
export type TargetConfig = z.infer<typeof TargetConfigSchema>;

export const PacingEnergyCurveSchema = z.enum([
  'hook_burst_build',
  'steady_fast',
  'climax_drop',
  'calm_story'
]);
export type PacingEnergyCurve = z.infer<typeof PacingEnergyCurveSchema>;

export const PacingShotSchema = z.object({
  index: z.number().int().min(1),
  startSec: z.number().min(0),
  endSec: z.number().positive(),
  durationSec: z.number().positive(),
  role: z.enum(['hook', 'body', 'climax', 'outro']),
  suggestedZoom: z.number().min(1).max(1.5).default(1)
});
export type PacingShot = z.infer<typeof PacingShotSchema>;

export const PacingBlueprintSchema = z.object({
  schemaVersion: z.literal('1.0').default('1.0'),
  sourceDurationSec: z.number().positive(),
  shotCount: z.number().int().min(1),
  avgShotDurationSec: z.number().positive(),
  cutsPerMinute: z.number().min(0),
  estimatedBpm: z.number().int().min(70).max(180),
  energyCurve: PacingEnergyCurveSchema,
  hookWindowAvgShotSec: z.number().positive(),
  styleSummary: z.string().min(4),
  shots: z.array(PacingShotSchema).min(1)
});
export type PacingBlueprint = z.infer<typeof PacingBlueprintSchema>;

export const EdlSegmentSchema = z.object({
  mediaAssetId: z.string().min(1),
  startSec: z.number().min(0),
  endSec: z.number().positive(),
  zoom: z.number().min(1).max(2.5).default(1),
  cropX: z.enum(['left', 'center', 'right']).default('center')
}).refine((seg) => seg.endSec > seg.startSec, {
  message: 'endSec harus lebih besar dari startSec'
});

export const SupportingOverlaysSchema = z.object({
  watermarkAssetId: z.string().nullable().default(null),
  watermarkPosition: z.enum(['top_left_safe', 'top_right_safe', 'bottom_left_safe']).default('top_left_safe'),
  watermarkOpacity: z.number().min(0.1).max(1).default(0.85),
  outroAssetId: z.string().nullable().default(null)
});

export const ComplianceOverlaysSchema = z.object({
  ctaText: z.string().max(120).default(''),
  ctaStartSec: z.number().min(0).default(0),
  disclosureText: z.string().max(80).default('')
});

export const EdlSchema = z.object({
  schemaVersion: z.literal('1.1').default('1.1'),
  aspectRatio: z.enum(['9:16', '16:9']),
  framingMode: z.enum(['center_crop', 'fit_blur_bg', 'split_screen']).default('fit_blur_bg'),
  resolution: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().min(24).max(60).default(30)
  }),
  segments: z.array(EdlSegmentSchema).min(1),
  audio: z.object({
    originalVolume: z.number().min(0).max(1.5),
    muteOriginal: z.boolean(),
    normalizeLufs: z.number().min(-24).max(-8).default(-14),
    intendedPlatformSound: z.enum([
      'none',
      'tiktok_trending_overlay',
      'youtube_shorts_sound_overlay'
    ])
  }),
  hookBanner: z.object({
    enabled: z.boolean(),
    text: z.string().max(120),
    startSec: z.number().min(0),
    endSec: z.number().min(0),
    position: z.enum(['top_safe_zone', 'upper_middle']).default('top_safe_zone')
  }),
  captions: z.object({
    enabled: z.boolean(),
    style: z.enum(['hormozi_bold', 'clean_minimal', 'bilingual', 'off']),
    fontFamily: z.string().default('Montserrat-ExtraBold'),
    safeZonePreset: z.enum(['tiktok_9_16', 'youtube_shorts_9_16', 'youtube_16_9']),
    verticalOffsetPct: z.number().min(45).max(82).default(72),
    overrides: z.array(z.object({
      index: z.number().int().min(0),
      text: z.string()
    })).default([])
  }),
  supportingOverlays: SupportingOverlaysSchema.default({}),
  complianceOverlays: ComplianceOverlaysSchema.default({})
});
export type EdlDocument = z.infer<typeof EdlSchema>;

export const EdlPatchSchema = z.object({
  humanSummary: z.string().min(3),
  framingMode: z.enum(['center_crop', 'fit_blur_bg', 'split_screen']).optional(),
  audioPatch: EdlSchema.shape.audio.partial().optional(),
  segmentsPatch: z.array(EdlSegmentSchema).min(1).optional(),
  hookBannerPatch: EdlSchema.shape.hookBanner.partial().optional(),
  captionsPatch: EdlSchema.shape.captions.partial().optional(),
  supportingOverlaysPatch: SupportingOverlaysSchema.partial().optional(),
  complianceOverlaysPatch: ComplianceOverlaysSchema.partial().optional()
});
export type EdlPatch = z.infer<typeof EdlPatchSchema>;

export const ViralScoreCritiqueSchema = z.object({
  totalScore: z.number().int().min(0).max(100),
  briefComplianceStatus: z.enum(['pass', 'warn', 'fail']),
  dimensions: z.object({
    hookStrength: z.object({ score: z.number().int().min(0).max(100), note: z.string() }),
    retentionPacing: z.object({ score: z.number().int().min(0).max(100), note: z.string() }),
    briefCompliance: z.object({ score: z.number().int().min(0).max(100), note: z.string() }),
    audienceFit: z.object({ score: z.number().int().min(0).max(100), note: z.string() }),
    engagementTrigger: z.object({ score: z.number().int().min(0).max(100), note: z.string() }),
    audioSafeZone: z.object({ score: z.number().int().min(0).max(100), note: z.string() })
  }),
  briefChecklist: z.array(z.object({
    rule: z.string(),
    status: z.enum(['pass', 'warn', 'fail']),
    evidence: z.string()
  })),
  projectedImpact: z.object({
    firstThreeSeconds: z.string(),
    midRetention: z.string(),
    commentSharePotential: z.string(),
    audienceReactionSummary: z.string()
  }),
  critiques: z.array(z.object({
    id: z.string(),
    timestampSec: z.number().min(0).optional(),
    severity: z.enum(['high', 'medium', 'low']),
    issue: z.string(),
    suggestedRegeneratePrompt: z.string()
  }))
});
export type ViralScoreCritique = z.infer<typeof ViralScoreCritiqueSchema>;

export const UploadPlaybookSchema = z.object({
  audioMusicGuide: z.object({
    renderedAudioState: z.string(),
    recommendedMusicVibe: z.string(),
    bpmRange: z.string(),
    platformMixingInstruction: z.string()
  }),
  titleOptions: z.array(z.string()).min(1).max(5),
  captionDescription: z.string(),
  hashtags: z.object({
    mandatory: z.array(z.string()),
    niche: z.array(z.string()),
    broad: z.array(z.string())
  }),
  optimalSchedule: z.object({
    timezone: z.string(),
    bestDays: z.array(z.string()),
    bestTimeSlots: z.array(z.string()),
    rationale: z.string()
  }),
  engagementToolkit: z.object({
    pinnedComments: z.array(z.string()),
    first15MinChecklist: z.array(z.string()),
    coverFrameSec: z.number().min(0)
  })
});
export type UploadPlaybook = z.infer<typeof UploadPlaybookSchema>;

export const CreateApiKeyInputSchema = z.object({
  provider: AiProviderSchema,
  role: AiKeyRoleSchema,
  label: z.string().trim().min(2).max(80),
  apiKey: z.string().trim().min(8).max(300),
  defaultModel: z.string().trim().min(2).max(100)
});

export const CreateMasterPresetInputSchema = z.object({
  category: MasterPresetCategorySchema,
  code: z.string().trim().min(2).max(60).regex(/^[a-z0-9_-]+$/i),
  labelId: z.string().trim().min(2).max(120),
  config: z.record(z.unknown()).default({}),
  sortOrder: z.number().int().min(0).max(999).default(100),
  isActive: z.boolean().default(true)
});

export const UpdateMasterPresetInputSchema = z.object({
  labelId: z.string().trim().min(2).max(120).optional(),
  config: z.record(z.unknown()).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional()
});

export const CreateTargetProfileInputSchema = z.object({
  profileName: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional(),
  targetConfig: TargetConfigSchema,
  isDefault: z.boolean().default(false)
});

export const AuthSetupInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(100)
});

export const AuthLoginInputSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(100)
});

export const CampaignStatusSchema = z.enum([
  'draft',
  'ready',
  'processing',
  'completed',
  'archived'
]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const CreateCampaignInputSchema = z.object({
  title: z.string().trim().min(2).max(140),
  brandOwner: z.string().trim().max(100).optional().default(''),
  platformTargets: z.array(PlatformTargetSchema).min(1).default(['tiktok', 'youtube_shorts']),
  rewardNotes: z.string().trim().max(500).optional().default(''),
  deadlineAt: z.string().datetime().nullable().optional()
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignInputSchema>;

export const UpdateCampaignInputSchema = z.object({
  title: z.string().trim().min(2).max(140).optional(),
  brandOwner: z.string().trim().max(100).optional(),
  platformTargets: z.array(PlatformTargetSchema).min(1).optional(),
  rewardNotes: z.string().trim().max(500).optional(),
  deadlineAt: z.string().datetime().nullable().optional(),
  status: CampaignStatusSchema.optional()
});

export const UpdateBriefRulebookInputSchema = z.object({
  rawText: z.string().min(1).optional(),
  rulebook: BriefRulebookSchema,
  confirmedByUser: z.boolean().default(true)
});

export const MediaAssetTypeSchema = z.enum(['raw_video', 'watermark', 'outro', 'broll']);
export type MediaAssetType = z.infer<typeof MediaAssetTypeSchema>;

export const AudioDiagnosticSchema = z.object({
  hasAudio: z.boolean(),
  meanVolumeDb: z.number().nullable(),
  maxVolumeDb: z.number().nullable(),
  loudnessLufs: z.number().nullable(),
  recommendedAudioMode: z.enum([
    'original_normalized',
    'ducking_20',
    'mute_for_platform_sound'
  ]),
  reason: z.string()
});
export type AudioDiagnostic = z.infer<typeof AudioDiagnosticSchema>;

export const WordTimestampSchema = z.object({
  word: z.string(),
  startSec: z.number().min(0),
  endSec: z.number().min(0)
});
export type WordTimestamp = z.infer<typeof WordTimestampSchema>;

export const SilenceIntervalSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  durationSec: z.number().min(0)
});
export type SilenceInterval = z.infer<typeof SilenceIntervalSchema>;

export const TranscriptPayloadSchema = z.object({
  mode: z.enum(['stt_word_level', 'visual_only', 'not_transcribed']),
  provider: z.string().optional(),
  language: z.string().optional(),
  fullText: z.string(),
  chunksProcessed: z.number().int().min(0).default(0),
  words: z.array(WordTimestampSchema).default([])
});
export type TranscriptPayload = z.infer<typeof TranscriptPayloadSchema>;

export const CompleteChunkUploadInputSchema = z.object({
  uploadId: z.string().trim().min(6).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  originalFilename: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().min(1).max(120),
  totalChunks: z.number().int().min(1).max(1000),
  assetType: MediaAssetTypeSchema.default('raw_video')
});

export type ServiceResult<T> =
  | { ok: true; data: T; meta?: Record<string, unknown> }
  | { ok: false; code: string; message: string; statusCode: number; details?: unknown };

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  meta?: Record<string, unknown>;
}
