// Работа с медиа: сжатие фото перед сохранением/отправкой.

// «Сегодня» по Ташкенту (UTC+5) — не зависит от часового пояса устройства.
// ВАЖНО: поле объявлено на уровне модуля (не внутри CashRegisterView),
// иначе React пересоздаёт input на каждый символ и он теряет фокус.
// сжатие фото чека/товара до ~900px jpeg (для хранения в прототипе)
export const compressPhoto = (file) =>
  new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const max = 900;
          let w = img.width,
            h = img.height;
          if (Math.max(w, h) > max) {
            const k = max / Math.max(w, h);
            w = Math.round(w * k);
            h = Math.round(h * k);
          }
          const cv = document.createElement("canvas");
          cv.width = w;
          cv.height = h;
          cv.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL("image/jpeg", 0.55));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = reject;
      img.src = rd.result;
    };
    rd.onerror = reject;
    rd.readAsDataURL(file);
  });

// Стандартный дропдаун системы (нативный <select> нельзя стилизовать внутри —
// список рисует ОС, поэтому ключевые места используют этот компонент).
