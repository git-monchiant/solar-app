# Deploy Solar App → UAT (172.22.22.100)

> ครั้งแรก: ทำตาม step 1-5
> ครั้งถัดไป: แค่ git pull + docker compose up -d --build (step 5)

---

## 1. SSH เข้า UAT

```bash
ssh optimus-dev@172.22.22.100 -p 1822
# pass: 0pt!musd3V
```

## 2. (ครั้งแรกเท่านั้น) ลบ placeholder + clone repo

Placeholder ที่ infra วางไว้ใช้ IP `172.22.22.104` (เก่า) — ต้องเอาออกก่อน

```bash
cd ~/solar-app
docker compose down
rm -rf html docker-compose.yml        # ลบ placeholder

# Clone repo มาลงที่ ~/solar-app
cd ~
git clone https://<GITHUB_PAT>@github.com/git-monchiant/solar-app.git solar-app
cd solar-app
```

## 3. (ครั้งแรกเท่านั้น) สร้าง `.env` + โฟลเดอร์ uploads

```bash
# copy จาก Mac ขึ้นไป (รัน command นี้จาก Mac)
scp -P 1822 .env.local optimus-dev@172.22.22.100:~/solar-app/.env

# หรือสร้างบน server โดยตรง
cat > ~/solar-app/.env <<'EOF'
DB_SERVER=172.41.1.73
DB_PORT=1433
DB_USER=monchiant
DB_PASSWORD=monchiant
DB_NAME=solardb
GEMINI_API_KEY=...
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
EOF

mkdir -p ~/solar-app/uploads
```

## 4. (ครั้งแรกเท่านั้น) verify DB ต่อได้จาก container

```bash
# จาก host ต่อไม่ได้ (firewall เปิดเฉพาะ .105) — ปกติ
# ต้องทดสอบจาก container บน macvlan
docker run --rm --network optimus_vlan2222 --ip 172.22.22.106 alpine sh -c \
  "apk add --no-cache busybox-extras >/dev/null && nc -zvw3 172.41.1.73 1433"
# คาดว่าขึ้น "open"
```

## 5. Build + Deploy

```bash
cd ~/solar-app
git pull                              # ดึง code ล่าสุด (ถ้า deploy ซ้ำ)
docker compose up -d --build          # build image + spin up บน .105
docker compose logs -f app            # ดู log จน "Ready"
```

## 6. ทดสอบ

```bash
# ภายใน server
curl -I http://172.22.22.105

# ภายนอก (ผ่าน Cloudflare)
curl -I https://solar.senadigital.com
```

---

## คำสั่งที่ใช้บ่อย

| งาน | คำสั่ง |
|-----|-------|
| ดู log realtime | `docker compose logs -f app` |
| restart โดยไม่ rebuild | `docker compose restart app` |
| rebuild หลังแก้ code | `git pull && docker compose up -d --build` |
| เข้า shell container | `docker exec -it solar-app sh` |
| เช็ค env ที่ container เห็น | `docker exec solar-app printenv \| sort` |
| เช็คพื้นที่ image เก่า | `docker image ls solar-app` |
| ลบ image เก่า | `docker image prune -f` |

---

## Troubleshooting

| อาการ | สาเหตุที่เป็นไปได้ | วิธีแก้ |
|-------|-------------------|--------|
| `https://solar.senadigital.com` ขึ้น 502 | container ยังไม่ up หรือ port ไม่ใช่ 80 | `docker ps` → เช็ค status + `docker logs solar-app` |
| `git pull` ไม่ผ่าน | PAT หมดอายุ | สร้าง PAT ใหม่ที่ github.com/settings/tokens |
| Upload รูปหายหลัง redeploy | uploads ไม่ได้ mount | ตรวจ `volumes:` ใน compose + `~/solar-app/uploads/` |
| Build ช้ามาก | npm install cache หาย | ครั้งแรกช้าเป็นปกติ (~3-5 นาที); ครั้งต่อไป cache ใช้ได้ |
| MSSQL ต่อไม่ได้ใน app | container ไม่อยู่บน `.105` / firewall | `docker inspect solar-app \| grep IPAddress` ต้องเป็น 105 |
| Container loop restart | build succeed แต่ runtime error | `docker logs solar-app` หา stack trace |

---

## หมายเหตุ

- **ห้าม** `docker compose` โดยไม่ `git pull` ก่อน (จะ deploy code เก่า)
- **ห้าม** เปลี่ยน IP `172.22.22.105` ใน compose — infra lock ไว้แล้ว
- **ห้าม** commit `.env` เข้า git — อยู่ใน `.gitignore` แล้ว
- Upload folder บน host = `~/solar-app/uploads/` = ภายใน container `/app/public/uploads`
- Log rotation: json-file driver 10MB × 3 files (~30MB ต่อ container)
