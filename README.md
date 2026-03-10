# ⛰️ 관악산 등산 대작전

**횃불이유괴단** 첫 번째 프로젝트!

관악산 등산 미니게임 — 무한의계단 감성 도트풍 등산 게임

## 🎮 게임 소개

- 100계단을 올라 관악산 정상(632m)을 정복하세요!
- 다음 계단 방향(◀ ▶)에 맞춰 클릭 or 키보드 ← →
- ❤️ 목숨 3개, 다 쓰면 추락!
- 정상 도착 → 소원 빌기 → 등산 완료증(PNG) → 방명록

---

## 🔥 Firebase 설정 (필수! 5분이면 끝)

방명록 기능을 위해 Firebase 프로젝트가 필요합니다.

### 1단계: Firebase 프로젝트 만들기
1. [Firebase Console](https://console.firebase.google.com) 접속
2. **프로젝트 추가** 클릭
3. 프로젝트 이름: `gwanaksan-climb` (자유)
4. Google Analytics는 꺼도 됩니다

### 2단계: 웹 앱 등록
1. 프로젝트 대시보드에서 **</>** (웹) 아이콘 클릭
2. 앱 닉네임: `gwanaksan-web`
3. **Firebase Hosting**은 체크 안 해도 됨 (Vercel 쓸 거니까)
4. **앱 등록** 클릭
5. `firebaseConfig` 객체가 나오면 복사

### 3단계: config 값 붙여넣기
`src/firebase.js` 파일을 열고 `firebaseConfig` 값을 교체:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "gwanaksan-climb.firebaseapp.com",
  projectId: "gwanaksan-climb",
  storageBucket: "gwanaksan-climb.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### 4단계: Firestore 데이터베이스 만들기
1. Firebase Console → **Firestore Database**
2. **데이터베이스 만들기** 클릭
3. **테스트 모드에서 시작** 선택
4. 위치: `asia-northeast3` (서울) 추천
5. **규칙** 탭에서 `firestore.rules` 파일 내용을 붙여넣기

---

## 🚀 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

## 📦 Vercel 배포

```bash
# 1. GitHub에 push
git init
git add .
git commit -m "관악산 등산 대작전 🏔️"
git remote add origin https://github.com/너의계정/gwanaksan-climb.git
git push -u origin main

# 2. Vercel에서 import
# vercel.com → New Project → GitHub repo 선택 → Deploy
```

프레임워크: Vite 자동 감지됨. 별도 설정 불필요!

---

## 🛠️ 기술 스택

- React 18 + Vite
- Tone.js (8bit 효과음)
- Canvas API (완료증 생성)
- Firebase Firestore (방명록)

---

횃불이유괴단 © 2025 🔥
