/* Roda antes da primeira pintura: liga os efeitos e escolhe o modo leve.
   Sem este arquivo (ou sem JS), o site aparece completo e sem animação. */
(() => {
  const root = document.documentElement;
  root.classList.add('fx');
  const saveData = navigator.connection && navigator.connection.saveData;
  const weak =
    (navigator.hardwareConcurrency || 8) <= 4 ||
    (navigator.deviceMemory || 8) <= 4 ||
    window.matchMedia('(max-width: 720px)').matches ||
    saveData;
  if (weak) root.classList.add('lite');
})();
