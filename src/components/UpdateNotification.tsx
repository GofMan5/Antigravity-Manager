import React, { useEffect, useState } from 'react';
import { X, Download, Sparkles, Loader2, CheckCircle, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { request as invoke } from '../utils/request';
import { useTranslation } from 'react-i18next';
import { check as tauriCheck } from '@tauri-apps/plugin-updater';
import { relaunch as tauriRelaunch } from '@tauri-apps/plugin-process';
import { isTauri } from '../utils/env';
import { showToast } from './common/ToastContainer';

interface UpdateInfo {
  has_update: boolean;
  latest_version: string;
  current_version: string;
  download_url: string;
}

type UpdateState = 'checking' | 'available' | 'downloading' | 'ready' | 'none';

interface UpdateNotificationProps {
  onClose: () => void;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>('checking');
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    try {
      const info = await invoke<UpdateInfo>('check_for_updates');
      if (info.has_update) {
        setUpdateInfo(info);
        setUpdateState('available');
        setTimeout(() => setIsVisible(true), 100);
      } else {
        onClose();
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      onClose();
    }
  };

  const handleAutoUpdate = async () => {
    if (!isTauri()) {
      handleManualDownload();
      return;
    }

    setUpdateState('downloading');
    try {
      const update = await tauriCheck();
      if (update) {
        let downloaded = 0;
        let contentLength = 0;

        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              contentLength = event.data.contentLength || 0;
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              if (contentLength > 0) {
                setDownloadProgress(Math.round((downloaded / contentLength) * 100));
              }
              break;
            case 'Finished':
              setUpdateState('ready');
              break;
          }
        });

        setUpdateState('ready');
        setTimeout(async () => {
          await tauriRelaunch();
        }, 1500);
      } else {
        console.warn('Native updater returned null, falling back to manual download');
        showToast(t('update_notification.fallback_manual', 'Auto-update not ready, opening download page...'), 'info');
        setUpdateState('available');
        handleManualDownload();
      }
    } catch (error) {
      console.error('Auto update failed:', error);
      showToast(t('update_notification.auto_failed', 'Auto-update failed, opening download page...'), 'error');
      setUpdateState('available');
      handleManualDownload();
    }
  };

  const handleManualDownload = () => {
    if (updateInfo?.download_url) {
      window.open(updateInfo.download_url, '_blank');
      handleClose();
    }
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  if (!updateInfo && updateState !== 'checking') {
    return null;
  }

  const isProcessing = updateState === 'downloading' || updateState === 'ready';

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 100, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 100, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-20 right-6 z-[100] w-80"
        >
          <div className="bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            {/* Glow Effects */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="relative z-10 flex items-start justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 shadow-lg shadow-blue-500/25">
                  {updateState === 'ready' ? (
                    <CheckCircle className="w-5 h-5 text-white" />
                  ) : (
                    <Sparkles className="w-5 h-5 text-white" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    {updateState === 'ready'
                      ? t('update_notification.ready', 'Update Ready')
                      : t('update_notification.title', 'New Update Available')}
                  </h3>
                  {updateInfo && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                      v{updateInfo.latest_version}
                    </span>
                  )}
                </div>
              </div>

              {!isProcessing && (
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Content */}
            <div className="relative z-10 p-4 space-y-4">
              {/* Message */}
              <p className="text-sm text-zinc-400">
                {updateState === 'downloading' && t('update_notification.downloading', 'Downloading update...')}
                {updateState === 'ready' && t('update_notification.restarting', 'Restarting application...')}
                {updateState === 'available' && updateInfo && (
                  <>
                    {t('update_notification.message', { current: updateInfo.current_version })}
                  </>
                )}
              </p>

              {/* Progress Bar */}
              {updateState === 'downloading' && (
                <div className="space-y-2">
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden border border-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${downloadProgress}%` }}
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 text-center font-mono">{downloadProgress}%</p>
                </div>
              )}

              {/* Actions */}
              {updateState === 'available' && (
                <div className="flex gap-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAutoUpdate}
                    className="flex-1 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {t('update_notification.auto_update', 'Update Now')}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleManualDownload}
                    className="p-2.5 bg-zinc-800 text-zinc-400 rounded-xl hover:bg-zinc-700 hover:text-white transition-all"
                    title={t('update_notification.manual_download', 'Download manually')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </motion.button>
                </div>
              )}

              {/* Processing State */}
              {isProcessing && (
                <div className="flex items-center justify-center gap-3 py-2">
                  {updateState === 'downloading' && (
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  )}
                  {updateState === 'ready' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="p-2 rounded-full bg-emerald-500/20"
                    >
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    </motion.div>
                  )}
                </div>
              )}
            </div>

            {/* Footer - Version Comparison */}
            {updateInfo && updateState === 'available' && (
              <div className="relative z-10 px-4 pb-4">
                <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-600">
                  <span className="font-mono">v{updateInfo.current_version}</span>
                  <span>→</span>
                  <span className="font-mono text-emerald-500">v{updateInfo.latest_version}</span>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
