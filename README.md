# Gölge Köyü — Çoklu Oyunculu Sunucu

`golge-koyu.html` şu an **tek başına, botlara karşı** oynanan tam bir oyundur —
3D sahne, roller, gece/gündüz, oylama, kazanma koşulları dahil, indirip
doğrudan tarayıcıda açabilirsiniz.

Bu klasördeki `server.js`, gerçek arkadaşlarınızla internetten oynamak
istediğinizde kullanacağınız **Socket.io tabanlı** bir sunucu iskeletidir.
Oda kurma/katılma, rol dağıtımı, gece/gündüz fazı senkronizasyonu ve sohbet
aktarımı hazır; `golge-koyu.html`'deki üç.js arayüzünü bu olaylara
bağlamanız gerekiyor (aşağıda olay listesi var).

## Çalıştırma (yerelde test)

```bash
cd server
npm install
node server.js
```

Sunucu `http://localhost:3000` üzerinde ayağa kalkar.

## Ücretsiz internete açma

1. Bu `server` klasörünü bir GitHub reposuna atın.
2. [Render.com](https://render.com) → "New Web Service" → repo'yu seçin →
   Build command: `npm install`, Start command: `node server.js`.
   (Railway.app veya Glitch.com da benzer şekilde ücretsiz çalışır.)
3. Render size `https://sizin-oyun.onrender.com` gibi bir adres verir —
   arkadaşlarınız bu adrese bağlanabilir.

## Socket.io olay sözleşmesi (client tarafına eklenecek)

| Yön | Olay | Veri |
|---|---|---|
| → sunucu | `room:create` | `{ name }` |
| → sunucu | `room:join` | `{ code, name }` |
| ← sunucu | `room:update` | `{ code, phase, round, players }` |
| → sunucu | `room:start` | — (sadece oda kurucusu) |
| ← sunucu | `role:assign` | `{ role }` (kişiye özel) |
| ← sunucu | `phase:change` | `{ phase, round }` |
| → sunucu | `night:action` | `{ targetId }` |
| → sunucu | `night:resolve` | — |
| ← sunucu | `night:result` | `{ deadName, saved }` |
| ← sunucu | `sheriff:result` | `{ name, isMafia }` (kişiye özel) |
| → sunucu | `chat:message` | `{ text }` |
| ← sunucu | `chat:message` | `{ name, text }` |
| → sunucu | `vote:cast` | `{ targetId }` |
| ← sunucu | `vote:update` | `{ [playerId]: targetId }` |
| → sunucu | `vote:tally` | — |
| ← sunucu | `vote:result` | `{ executedName }` |

`golge-koyu.html` içindeki `resolveNight()`, `startVote()`, `tallyVotes()`
gibi fonksiyonlar şu an yerel bot mantığıyla çalışıyor; bunları yukarıdaki
socket olaylarını dinleyip/tetikleyecek şekilde değiştirirseniz oyun tam
çevrimiçi hale gelir. İsterseniz bu entegrasyonu bir sonraki adımda birlikte
yapabiliriz.
