import { useEffect, useMemo } from 'react';

import { api } from '../../../../../lib/api';
import { useAuthedQuery } from '../../../../../lib/auth-query';
import type { CameraEntity } from '../../domain/entities';
import {
  cameraFreshness,
  cameraHasPlatformFrame,
  cameraRefreshMs,
  latestFrameId,
  platformCameraId,
} from '../../domain/cameraHealth';

export function CameraFeed({ entity }: { entity: CameraEntity }) {
  const platformId = platformCameraId(entity);
  const frameId = latestFrameId(entity);
  const canFetchSnapshot = cameraHasPlatformFrame(entity);
  const health = cameraFreshness(entity);

  const frameImageQuery = useAuthedQuery({
    queryKey: ['factory-twin', 'camera', platformId, 'latest-frame-image', frameId],
    queryFn: (token) => api.fetchCameraLatestFrameBlob(token, platformId as string),
    enabled: canFetchSnapshot,
    placeholderData: (previousData) => previousData,
    staleTime: 0,
    refetchInterval: cameraRefreshMs(entity),
  });

  const imageUrl = useMemo(() => {
    if (!frameImageQuery.data) return null;
    return URL.createObjectURL(frameImageQuery.data);
  }, [frameImageQuery.data]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  return (
    <div
      className={`cam-feed ${entity.online ? '' : 'offline'} ${imageUrl ? 'snapshot-ready' : health.state}`}
      aria-label={`${entity.name} 監視器畫面`}
    >
      {imageUrl ? (
        <img
          key={frameId ?? platformId ?? entity.id}
          src={imageUrl}
          alt={`${entity.name} 雲端最新截圖`}
          className="cam-frame-img"
        />
      ) : (
        <div className="cam-noise" aria-hidden="true" />
      )}
    </div>
  );
}

export function CameraMonitor({ entity }: { entity: CameraEntity }) {
  return (
    <div className="detail">
      <div className="panel-title">監視器</div>
      <h3 className="detail-name">{entity.name}</h3>
      <CameraFeed entity={entity} />
    </div>
  );
}
