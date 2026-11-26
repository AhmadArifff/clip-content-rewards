import { ref } from 'vue';
import type { ApiEnvelope, MediaAssetType } from '@clip/shared';
import { apiRequest } from './useApi';

const CHUNK_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB per chunk agar ringan di memori & proxy lokal

export function useChunkedUploader() {
  const uploading = ref(false);
  const progressPct = ref(0);
  const stageText = ref('');

  async function uploadMediaFile(params: {
    campaignId: string;
    file: File;
    assetType: MediaAssetType;
  }): Promise<unknown> {
    const { campaignId, file, assetType } = params;
    uploading.value = true;
    progressPct.value = 0;
    stageText.value = 'Menyiapkan potongan berkas...';

    try {
      const uploadId = `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE_BYTES));

      for (let i = 0; i < totalChunks; i += 1) {
        const start = i * CHUNK_SIZE_BYTES;
        const end = Math.min(file.size, start + CHUNK_SIZE_BYTES);
        const blob = file.slice(start, end);

        stageText.value = `Mengunggah bagian ${i + 1} dari ${totalChunks}...`;
        const form = new FormData();
        form.append('uploadId', uploadId);
        form.append('chunkIndex', String(i));
        form.append('chunk', blob, `chunk_${i}.bin`);

        const res = await fetch(`/api/campaigns/${campaignId}/media/chunk`, {
          method: 'POST',
          credentials: 'include',
          body: form
        });

        const body = (await res.json()) as ApiEnvelope<unknown>;
        if (!res.ok || !body.success) {
          throw new Error(body.error?.message || `Gagal mengunggah bagian ${i + 1}.`);
        }

        progressPct.value = Math.round(((i + 1) / totalChunks) * 85);
      }

      stageText.value = 'Menggabungkan berkas & memeriksa audio/video via FFprobe...';
      const completeRes = await apiRequest(`/api/campaigns/${campaignId}/media/complete`, {
        method: 'POST',
        body: JSON.stringify({
          uploadId,
          originalFilename: file.name,
          mimeType: file.type || 'application/octet-stream',
          totalChunks,
          assetType
        })
      });

      progressPct.value = 100;
      stageText.value = 'Selesai diverifikasi!';
      return completeRes.data;
    } finally {
      uploading.value = false;
    }
  }

  return {
    uploading,
    progressPct,
    stageText,
    uploadMediaFile
  };
}
