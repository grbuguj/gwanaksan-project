// 🔥 Firebase 설정 파일
// Firebase Console (https://console.firebase.google.com) 에서 프로젝트 만들고
// 아래 값을 본인 프로젝트 설정으로 교체하세요!
//
// 📌 설정 방법:
// 1. Firebase Console → 프로젝트 만들기
// 2. 프로젝트 설정 → 웹 앱 추가 (</>)
// 3. 아래 firebaseConfig에 값 붙여넣기
// 4. Firestore Database → 데이터베이스 만들기 → 테스트 모드로 시작
//    (나중에 보안규칙 수정 필요)

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "여기에-API-KEY",
  authDomain: "여기에-프로젝트.firebaseapp.com",
  projectId: "여기에-프로젝트-ID",
  storageBucket: "여기에-프로젝트.appspot.com",
  messagingSenderId: "여기에-SENDER-ID",
  appId: "여기에-APP-ID",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
