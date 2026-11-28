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
  'prompt_preset',
  'retention_policy'
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

export const FramingModeSchema = z.enum([
  'center_crop',
  'fit_blur_bg',
  'split_screen',
  'auto_face_track'
]);
export type FramingMode = z.infer<typeof FramingModeSchema>;

export const ClipEndingModeSchema = z.enum([
  'complete_story',
  'full_source',
  'part_series'
]);
export type ClipEndingMode = z.infer<typeof ClipEndingModeSchema>;

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
  framingMode: FramingModeSchema.default('fit_blur_bg'),
  captionStyle: z.enum(['hormozi_bold', 'clean_minimal', 'bilingual', 'off']),
  initialAudioMode: z.enum([
    'original_normalized',
    'ducking_20',
    'mute_for_platform_sound'
  ]),
  batchDiversityMode: z.enum(['distinct_moments', 'ab_hook_test']).default('distinct_moments'),
  clipEndingMode: ClipEndingModeSchema.default('complete_story'),
  batchCount: z.number().int().min(1).max(10),
  referencePacingId: z.string().nullable().optional(),
  brandKitId: z.string().nullable().optional(),
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
  cropX: z.enum(['left', 'center', 'right']).default('center'),
  focusX: z.number().min(0).max(1).optional()
}).refine((seg) => seg.endSec > seg.startSec, {
  message: 'endSec harus lebih besar dari startSec'
});

export const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Format warna harus #RRGGBB');

export const SupportingOverlaysSchema = z.object({
  watermarkAssetId: z.string().nullable().default(null),
  watermarkPosition: z.enum(['top_left_safe', 'top_right_safe', 'bottom_left_safe']).default('top_left_safe'),
  watermarkOpacity: z.number().min(0.1).max(1).default(0.85),
  outroAssetId: z.string().nullable().default(null),
  brandKitId: z.string().nullable().optional().default(null),
  brandPrimaryColorHex: HexColorSchema.nullable().optional(),
  brandAccentColorHex: HexColorSchema.nullable().optional()
});

export const ComplianceOverlaysSchema = z.object({
  ctaText: z.string().max(120).default(''),
  ctaStartSec: z.number().min(0).default(0),
  disclosureText: z.string().max(80).default('')
});

export const EdlSchema = z.object({
  schemaVersion: z.literal('1.1').default('1.1'),
  aspectRatio: z.enum(['9:16', '16:9']),
  framingMode: FramingModeSchema.default('fit_blur_bg'),
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
  framingMode: FramingModeSchema.optional(),
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

export const PublishStatusSchema = z.enum([
  'unscheduled',
  'scheduled',
  'published'
]);
export type PublishStatus = z.infer<typeof PublishStatusSchema>;

export const UpdateClipScheduleInputSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  scheduledSlot: z.string().trim().max(40).nullable().optional(),
  publishStatus: PublishStatusSchema.optional(),
  publishedUrl: z.string().trim().max(300).nullable().optional(),
  calendarNote: z.string().trim().max(300).nullable().optional()
});
export type UpdateClipScheduleInput = z.infer<typeof UpdateClipScheduleInputSchema>;

export const AutoScheduleInputSchema = z.object({
  campaignId: z.string().min(1).optional(),
  batchId: z.string().min(1).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  maxPerPlatformPerDay: z.number().int().min(1).max(5).default(2),
  onlyApproved: z.boolean().default(false)
});
export type AutoScheduleInput = z.infer<typeof AutoScheduleInputSchema>;

export const AnnotationCategorySchema = z.enum(['visual', 'subtitle', 'audio', 'hook']);
export type AnnotationCategory = z.infer<typeof AnnotationCategorySchema>;

export const AnnotationStatusSchema = z.enum(['open', 'resolved']);
export type AnnotationStatus = z.infer<typeof AnnotationStatusSchema>;

export const CreateClipAnnotationInputSchema = z.object({
  versionId: z.string().min(1).optional(),
  timestampSec: z.number().min(0).max(36000),
  xPct: z.number().min(0).max(100),
  yPct: z.number().min(0).max(100),
  category: AnnotationCategorySchema.default('visual'),
  noteText: z.string().trim().min(2).max(400)
});
export type CreateClipAnnotationInput = z.infer<typeof CreateClipAnnotationInputSchema>;

export const UpdateClipAnnotationInputSchema = z.object({
  status: AnnotationStatusSchema.optional(),
  noteText: z.string().trim().min(2).max(400).optional(),
  category: AnnotationCategorySchema.optional()
});
export type UpdateClipAnnotationInput = z.infer<typeof UpdateClipAnnotationInputSchema>;

export const CreateBrandKitInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  brandTagline: z.string().trim().max(140).optional().default(''),
  primaryColorHex: HexColorSchema.default('#10B981'),
  accentColorHex: HexColorSchema.default('#F59E0B'),
  captionFontFamily: z.string().trim().min(2).max(60).default('Segoe UI'),
  defaultCaptionStyle: z.enum(['hormozi_bold', 'clean_minimal', 'bilingual', 'off']).default('hormozi_bold'),
  defaultWatermarkPos: z.enum(['top_left_safe', 'top_right_safe', 'bottom_left_safe']).default('top_left_safe'),
  defaultWatermarkOpacity: z.number().min(0.1).max(1).default(0.85),
  defaultCtaTemplate: z.string().trim().max(120).optional().default('')
});
export type CreateBrandKitInput = z.infer<typeof CreateBrandKitInputSchema>;

export const UpdateBrandKitInputSchema = CreateBrandKitInputSchema.partial();
export type UpdateBrandKitInput = z.infer<typeof UpdateBrandKitInputSchema>;

export const RetentionPolicyConfigSchema = z.object({
  staleDaysThreshold: z.number().int().min(3).max(365).default(30),
  warningDaysThreshold: z.number().int().min(1).max(180).default(14),
  publishedPruneDays: z.number().int().min(1).max(365).default(14),
  diskWarningMb: z.number().int().min(256).max(102400).default(5120)
});
export type RetentionPolicyConfig = z.infer<typeof RetentionPolicyConfigSchema>;

export const UpdateRetentionPolicyInputSchema = RetentionPolicyConfigSchema.refine(
  (p) => p.warningDaysThreshold < p.staleDaysThreshold,
  { message: 'Ambang peringatan dini harus lebih kecil daripada ambang kritis retensi.' }
);
export type UpdateRetentionPolicyInput = z.infer<typeof UpdateRetentionPolicyInputSchema>;

export const ClipRetentionActionInputSchema = z.object({
  action: z.enum(['pin', 'unpin', 'snooze']),
  snoozeDays: z.number().int().min(1).max(180).default(30)
});
export type ClipRetentionActionInput = z.infer<typeof ClipRetentionActionInputSchema>;

export const MaintenanceBulkClipsInputSchema = z.object({
  clipIds: z.array(z.string().min(1)).min(1).max(100)
});
export type MaintenanceBulkClipsInput = z.infer<typeof MaintenanceBulkClipsInputSchema>;

export const MaintenanceDeleteRawAssetsInputSchema = z.object({
  mediaAssetIds: z.array(z.string().min(1)).min(1).max(50)
});
export type MaintenanceDeleteRawAssetsInput = z.infer<typeof MaintenanceDeleteRawAssetsInputSchema>;

export type ServiceResult<T> =
  | { ok: true; data: T; meta?: Record<string, unknown> }
  | { ok: false; code: string; message: string; statusCode: number; details?: unknown };

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  meta?: Record<string, unknown>;
}
