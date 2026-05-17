import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '@/services/api';

export interface PrinterStatus {
  detected: boolean;
  name: string | null;
  online: boolean;
  method: 'escpos' | 'text' | 'none';
  lastChecked: string;
}

const SERVER_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

let _socket: Socket | null = null;
function getSocket(): Socket {
  if (!_socket || !_socket.connected) {
    _socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: true });
  }
  return _socket;
}

export function usePrinterStatus() {
  const [status, setStatus] = useState<PrinterStatus>({
    detected: false, name: null, online: false, method: 'none', lastChecked: '',
  });
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/printer/status');
      setStatus(data.data);
    } catch {
      // server unreachable — keep last known state
    } finally {
      setLoading(false);
    }
  }, []);

  const forceDetect = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/printer/detect');
      setStatus(data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  const testPrint = useCallback(async (printerName?: string) => {
    const { data } = await api.post('/printer/test', printerName ? { printerName } : {});
    return data.data as { success: boolean; message: string };
  }, []);

  useEffect(() => {
    fetchStatus();

    const socket = getSocket();

    const onConnected = (s: PrinterStatus) => setStatus(s);
    const onDisconnected = () =>
      setStatus(prev => ({ ...prev, detected: false, name: null, online: false, method: 'none' }));
    const onStatusChange = (s: PrinterStatus) => setStatus(s);

    socket.on('printer:connected',    onConnected);
    socket.on('printer:disconnected', onDisconnected);
    socket.on('printer:status',       onStatusChange);

    // Refresh every 30 s as fallback if socket misses an event
    const timer = setInterval(fetchStatus, 30_000);

    return () => {
      socket.off('printer:connected',    onConnected);
      socket.off('printer:disconnected', onDisconnected);
      socket.off('printer:status',       onStatusChange);
      clearInterval(timer);
    };
  }, [fetchStatus]);

  return { status, loading, forceDetect, testPrint, refetch: fetchStatus };
}
