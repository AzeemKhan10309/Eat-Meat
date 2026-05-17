const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize:  () => ipcRenderer.send('window:minimize'),
  maximize:  () => ipcRenderer.send('window:maximize'),
  close:     () => ipcRenderer.send('window:close'),

  // Dialogs
  openDialog: options  => ipcRenderer.invoke('dialog:open', options),
  saveDialog: options  => ipcRenderer.invoke('dialog:save', options),

  // App info
  getVersion:  () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),

  // Printing
  printReceipt: data => ipcRenderer.invoke('print:receipt', data),
});
