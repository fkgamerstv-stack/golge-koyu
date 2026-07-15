# Gölge Köyü — Çoklu Oyunculu Sunucu

`golge-koyu.html` artık **iki modlu**:

1. **Botlara Karşı Oyna** — tek başına, 8 bota karşı, tüm roller (Katil,
   Doktor, Dedektif, İnfazcı, Muhafız, Oyalayıcı, Soytarı, Vatandaş) tam
   çalışır durumda. Şüphe puanlamalı akıllı bot AI'sı var.
2. **Arkadaşlarınla Oyna (Online)** — bu klasördeki `server.js`'e bağlanır.
   Oda kurma/katılma, gerçek zamanlı roller, gece/gündüz/oylama fazları,
   sohbet hep senkronize. **Online modda şu an tam etkileşimli roller:
   Katil, Doktor, Dedektif.** Diğer roller (İnfazcı, Muhafız, Oyalayıcı,
   Soytarı) atanıyor ve kazanma hesabına dahil ediliyor ama gece özel
   yetenekleri henüz yerel moddaki kadar gelişmiş değil.

## Çalıştırma (yerelde test)

```bash
cd server
npm install
node server.js
```

Sunucu `http://localhost:3000` üzerinde ayağa kalkar. `public/index.html`
oyunun kendisidir — Express bunu otomatik sunar.

## Ücretsiz internete açma

1. Bu `server` klasörünü (server.js, package.json, public/index.html dahil)
   bir GitHub reposuna atın — **klasör yapısını olduğu gibi koruyun.**
2. [Render.com](https://render.com) → "New Web Service" → repo'yu seçin →
   Build command: `npm install`, Start command: `node server.js`.
3. Render size `https://sizin-oyun.onrender.com` gibi bir adres verir.
4. Oyunda "Arkadaşlarınla Oyna (Online)" seçip bu adresi "Sunucu adresi"
   kutusuna yazın, oda kurun/katılın.

## Faz zamanlaması (sunucu tarafında otomatik)

- Gece → gündüz açıklaması hemen (host `night:resolve` gönderince)
- Gündüz tartışma: **30 saniye**, sonra otomatik oylamaya geçer
- Oylama: **20 saniye** ya da herkes oy verince otomatik sonuçlanır

## Socket.io olay sözleşmesi

| Yön | Olay | Veri |
|---|---|---|
| → sunucu | `room:create` | `{ name }` |
| → sunucu | `room:join` | `{ code, name }` |
| ← sunucu | `room:update` | `{ code, phase, round, players }` |
| → sunucu | `room:start` | — (sadece oda kurucusu, 5-9 oyuncu gerekir) |
| ← sunucu | `role:assign` | `{ role }` (kişiye özel) |
| ← sunucu | `phase:change` | `{ phase, round }` |
| → sunucu | `night:action` | `{ targetId }` |
| → sunucu | `night:resolve` | — (host tetikler) |
| ← sunucu | `night:result` | `{ deadName, saved }` |
| ← sunucu | `sheriff:result` | `{ name, isMafia }` (kişiye özel) |
| → sunucu | `chat:message` | `{ text }` |
| ← sunucu | `chat:message` | `{ name, text }` |
| → sunucu | `vote:cast` | `{ targetId }` |
| ← sunucu | `vote:update` | `{ [playerId]: targetId }` |
| ← sunucu | `vote:result` | `{ executedName }` |
| ← sunucu | `game:end` | `{ winner, message }` |

İsterseniz İnfazcı/Muhafız/Oyalayıcı/Soytarı yeteneklerini de online moda
tam entegre edebiliriz — `server.js`'deki `night:resolve` fonksiyonu,
`index.html`'deki yerel `resolveNight()` mantığının aynısını sunucu
tarafında uygulayacak şekilde genişletilebilir.

