import fs from 'node:fs';
import path from 'node:path';
import type {
  CreateBrandKitInput,
  ServiceResult,
  UpdateBrandKitInput
} from '@clip/shared';
import { prisma } from '../config/prisma.js';
import { resolveSafeStoragePath } from '../config/storage.js';

const ALLOWED_LOGO_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp'
};

function formatKitDto(row: {
  id: string;
  name: string;
  brandTagline: string | null;
  primaryColorHex: string;
  accentColorHex: string;
  captionFontFamily: string;
  defaultCaptionStyle: string;
  defaultWatermarkPos: string;
  defaultWatermarkOpacity: number;
  logoFilePath: string | null;
  logoOriginalName: string | null;
  defaultCtaTemplate: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    brandTagline: row.brandTagline ?? '',
    primaryColorHex: row.primaryColorHex,
    accentColorHex: row.accentColorHex,
    captionFontFamily: row.captionFontFamily,
    defaultCaptionStyle: row.defaultCaptionStyle,
    defaultWatermarkPos: row.defaultWatermarkPos,
    defaultWatermarkOpacity: row.defaultWatermarkOpacity,
    hasLogo: Boolean(row.logoFilePath),
    logoOriginalName: row.logoOriginalName,
    logoUrl: row.logoFilePath ? `/api/brand-kits/${row.id}/logo?v=${row.updatedAt.getTime()}` : null,
    defaultCtaTemplate: row.defaultCtaTemplate ?? '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export const brandKitService = {
  async list(userId: string): Promise<ServiceResult<unknown>> {
    const rows = await prisma.brandAssetKit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    return { ok: true, data: rows.map(formatKitDto) };
  },

  async findRawForUser(userId: string, kitId: string) {
    return prisma.brandAssetKit.findFirst({
      where: { id: kitId, userId }
    });
  },

  async create(userId: string, input: CreateBrandKitInput): Promise<ServiceResult<unknown>> {
    const created = await prisma.brandAssetKit.create({
      data: {
        userId,
        name: input.name,
        brandTagline: input.brandTagline || null,
        primaryColorHex: input.primaryColorHex.toUpperCase(),
        accentColorHex: input.accentColorHex.toUpperCase(),
        captionFontFamily: input.captionFontFamily,
        defaultCaptionStyle: input.defaultCaptionStyle,
        defaultWatermarkPos: input.defaultWatermarkPos,
        defaultWatermarkOpacity: input.defaultWatermarkOpacity,
        defaultCtaTemplate: input.defaultCtaTemplate || null
      }
    });
    return { ok: true, data: formatKitDto(created) };
  },

  async update(userId: string, kitId: string, input: UpdateBrandKitInput): Promise<ServiceResult<unknown>> {
    const existing = await prisma.brandAssetKit.findFirst({ where: { id: kitId, userId } });
    if (!existing) {
      return {
        ok: false,
        code: 'BRAND_KIT_NOT_FOUND',
        message: 'Brand Asset Kit tidak ditemukan.',
        statusCode: 404
      };
    }

    const updated = await prisma.brandAssetKit.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.brandTagline !== undefined ? { brandTagline: input.brandTagline || null } : {}),
        ...(input.primaryColorHex !== undefined ? { primaryColorHex: input.primaryColorHex.toUpperCase() } : {}),
        ...(input.accentColorHex !== undefined ? { accentColorHex: input.accentColorHex.toUpperCase() } : {}),
        ...(input.captionFontFamily !== undefined ? { captionFontFamily: input.captionFontFamily } : {}),
        ...(input.defaultCaptionStyle !== undefined ? { defaultCaptionStyle: input.defaultCaptionStyle } : {}),
        ...(input.defaultWatermarkPos !== undefined ? { defaultWatermarkPos: input.defaultWatermarkPos } : {}),
        ...(input.defaultWatermarkOpacity !== undefined ? { defaultWatermarkOpacity: input.defaultWatermarkOpacity } : {}),
        ...(input.defaultCtaTemplate !== undefined ? { defaultCtaTemplate: input.defaultCtaTemplate || null } : {})
      }
    });

    return { ok: true, data: formatKitDto(updated) };
  },

  async uploadLogo(
    userId: string,
    kitId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string }
  ): Promise<ServiceResult<unknown>> {
    const existing = await prisma.brandAssetKit.findFirst({ where: { id: kitId, userId } });
    if (!existing) {
      return {
        ok: false,
        code: 'BRAND_KIT_NOT_FOUND',
        message: 'Brand Asset Kit tidak ditemukan.',
        statusCode: 404
      };
    }

    const ext = ALLOWED_LOGO_MIME[file.mimetype];
    if (!ext) {
      return {
        ok: false,
        code: 'INVALID_LOGO_FORMAT',
        message: 'Format logo tidak didukung. Gunakan file PNG, JPG, atau WebP maksimal 5 MB.',
        statusCode: 400
      };
    }

    const relDir = `brand-kits/${existing.id}`;
    const absDir = resolveSafeStoragePath(relDir);
    fs.mkdirSync(absDir, { recursive: true });

    if (existing.logoFilePath) {
      try {
        fs.rmSync(resolveSafeStoragePath(existing.logoFilePath), { force: true });
      } catch {
        // Abaikan jika file lama sudah tidak ada
      }
    }

    const relPath = `${relDir}/logo${ext}`;
    const absPath = resolveSafeStoragePath(relPath);
    fs.writeFileSync(absPath, file.buffer);

    const updated = await prisma.brandAssetKit.update({
      where: { id: existing.id },
      data: {
        logoFilePath: relPath,
        logoOriginalName: path.basename(file.originalname).slice(0, 120)
      }
    });

    return { ok: true, data: formatKitDto(updated) };
  },

  async resolveLogoFile(
    userId: string,
    kitId: string
  ): Promise<ServiceResult<{ absPath: string; sizeBytes: number; contentType: string }>> {
    const existing = await prisma.brandAssetKit.findFirst({ where: { id: kitId, userId } });
    if (!existing || !existing.logoFilePath) {
      return {
        ok: false,
        code: 'BRAND_LOGO_NOT_FOUND',
        message: 'Logo untuk Brand Kit ini belum diunggah.',
        statusCode: 404
      };
    }

    const absPath = resolveSafeStoragePath(existing.logoFilePath);
    if (!fs.existsSync(absPath)) {
      return {
        ok: false,
        code: 'BRAND_LOGO_FILE_MISSING',
        message: 'Berkas logo tidak ditemukan di penyimpanan lokal.',
        statusCode: 404
      };
    }

    const ext = path.extname(absPath).toLowerCase();
    const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
    return {
      ok: true,
      data: {
        absPath,
        sizeBytes: fs.statSync(absPath).size,
        contentType
      }
    };
  },

  async remove(userId: string, kitId: string): Promise<ServiceResult<{ deleted: true }>> {
    const existing = await prisma.brandAssetKit.findFirst({ where: { id: kitId, userId } });
    if (!existing) {
      return {
        ok: false,
        code: 'BRAND_KIT_NOT_FOUND',
        message: 'Brand Asset Kit tidak ditemukan.',
        statusCode: 404
      };
    }

    const absDir = resolveSafeStoragePath(`brand-kits/${existing.id}`);
    fs.rmSync(absDir, { recursive: true, force: true });
    await prisma.brandAssetKit.delete({ where: { id: existing.id } });
    return { ok: true, data: { deleted: true } };
  }
};
