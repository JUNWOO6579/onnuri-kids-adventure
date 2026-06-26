import React, { useState, useEffect, useRef } from "react";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  deleteDoc,
  setDoc,
  getDoc,
} from "firebase/firestore";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA6K5Ft8V2Gw6GZB9AEVwgdjZu8qqH7MJ8",
  authDomain: "onnuri-kids-app.firebaseapp.com",
  projectId: "onnuri-kids-app",
  storageBucket: "onnuri-kids-app.firebasestorage.app",
  messagingSenderId: "343947037917",
  appId: "1:343947037917:web:7df831cef8e256b6689f34",
  measurementId: "G-8FXH5XV3HC",
};

// 파이어베이스 이중 초기화 방지 및 복구 장치
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);
const appId = "onnuri-kids-adventure";

// 고정 캐러셀 이미지 기본값 정의
const DEFAULT_BANNERS = [
  {
    id: "def1",
    url: "https://images.unsplash.com/photo-1502082553048-f009c37129b9?q=80&w=1200&auto=format&fit=crop",
    priority: 1,
  },
  {
    id: "def2",
    url: "https://images.unsplash.com/photo-1516627145497-ae6968895b74?q=80&w=1200&auto=format&fit=crop",
    priority: 2,
  },
  {
    id: "def3",
    url: "https://images.unsplash.com/photo-1472162072142-d544e77ade5e?q=80&w=1200&auto=format&fit=crop",
    priority: 3,
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("main"); // main, apply, prayer, admin
  const [applyStep, setApplyStep] = useState(1); // 1: 안내문 보기, 2: 신청 폼 작성
  const [banners, setBanners] = useState(DEFAULT_BANNERS);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [user, setUser] = useState(null);

  // 티셔츠 사이즈 가이드 이미지 상태
  const [tshirtGuideUrl, setTshirtGuideUrl] = useState(null);
  const [tshirtUploadPreview, setTshirtUploadPreview] = useState(null);

  // 알림창 및 컨펌창 모달 상태 (alert/confirm 대체 장치)
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    message: "",
    onConfirm: null,
  });

  // 사용자가 지정한 완벽한 신청서 입력 폼 상태
  const [formData, setFormData] = useState({
    agreed: false, // 1. 개인정보 수집 및 이용 동의
    department: "유치1부 9:00", // 2. 부서 선택 (유치1부 9:00 / 유치2부 11:30)
    childName: "", // 3. 아이 이름
    childClass: "", // 3. 소속 반
    parentPhone: "", // 4. 보호자 연락처
    tshirtSize: "14호", // 기본값을 14호로 세팅
    specialNotes: "", // 5. 아이 특이사항 및 알러지 주의해야할 음식
    sponsor1: false, // 일일보조교사(부) 9:00-15:00
    sponsor2: false, // 일일보조교사(모) 9:00-15:00
    sponsor3: false, // 물놀이&정리도우미 13:00-16:00
    sponsor4: false, // 어드벤처 재정후원
    sponsor5: false, // 기도 및 필사섬김
  });

  // 기도제목 입력 폼 상태 (기존 prayerData와 prayerForm의 명칭 불일치를 prayerForm으로 완벽 통일)
  const [prayerForm, setPrayerForm] = useState({
    author: "",
    content: "",
    isPrivate: true, // 비공개 디폴트 설정
  });

  // 말씀 팝업 상태
  const [showWordPopup, setShowWordPopup] = useState(false);
  const [wordMessage, setWordMessage] = useState("");

  // 관리자 대시보드 리스트
  const [registrations, setRegistrations] = useState([]);
  const [prayers, setPrayers] = useState([]);

  // 캐러셀 이미지 업로드 상태
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadPriority, setUploadPriority] = useState("1");
  const fileInputRef = useRef(null);
  const tshirtInputRef = useRef(null);

  // 커스텀 토스트 알림 표시기
  const triggerToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 3000);
  };

  // 커스텀 컨펌 표시기
  const triggerConfirm = (message, onConfirm) => {
    setConfirmModal({ show: true, message, onConfirm });
  };

  // 파이어베이스 인증 절차
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (
          typeof __initial_auth_token !== "undefined" &&
          __initial_auth_token
        ) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else if (
          firebaseConfig.apiKey &&
          !firebaseConfig.apiKey.includes("YOUR_")
        ) {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.warn("인증이 로컬 백업 모드로 전환되었습니다.", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 데이터 동기화 리스너들
  useEffect(() => {
    // 1. 배너 이미지 동기화 (RULE 1 엄격 준수 경로로 수정)
    let unsubscribeBanners = () => {};
    if (user) {
      try {
        const bannersCol = collection(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "banners"
        );
        unsubscribeBanners = onSnapshot(
          bannersCol,
          (snapshot) => {
            const list = [];
            snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));

            const localBanners = JSON.parse(
              localStorage.getItem("local_banners") || "[]"
            );
            const combined = [...list, ...localBanners];

            if (combined.length === 0) {
              setBanners(DEFAULT_BANNERS);
            } else {
              setBanners(
                combined.sort(
                  (a, b) => Number(a.priority || 0) - Number(b.priority || 0)
                )
              );
            }
          },
          (err) => {
            console.error("배너 로드 에러:", err);
            loadFallbackBanners();
          }
        );
      } catch (e) {
        loadFallbackBanners();
      }
    } else {
      loadFallbackBanners();
    }

    // 2. 티셔츠 가이드 이미지 동기화
    let unsubscribeTshirt = () => {};
    if (user) {
      try {
        const tshirtDocRef = doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "settings",
          "global"
        );
        unsubscribeTshirt = onSnapshot(
          tshirtDocRef,
          (docSnap) => {
            if (docSnap.exists() && docSnap.data().tshirtGuideUrl) {
              setTshirtGuideUrl(docSnap.data().tshirtGuideUrl);
            } else {
              setTshirtGuideUrl(localStorage.getItem("local_tshirt_guide"));
            }
          },
          (err) => {
            console.error("티셔츠 설정 로드 에러:", err);
            setTshirtGuideUrl(localStorage.getItem("local_tshirt_guide"));
          }
        );
      } catch (e) {
        setTshirtGuideUrl(localStorage.getItem("local_tshirt_guide"));
      }
    } else {
      setTshirtGuideUrl(localStorage.getItem("local_tshirt_guide"));
    }

    // 3. 신청서 목록 실시간 동기화 (관리자 모드 전용)
    let unsubscribeRegs = () => {};
    if (user && isAdmin) {
      try {
        const regsCol = collection(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "registrations"
        );
        unsubscribeRegs = onSnapshot(
          regsCol,
          (snapshot) => {
            const list = [];
            snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
            setRegistrations(list);
          },
          (err) => {
            console.error("등록 로드 에러:", err);
            setRegistrations(
              JSON.parse(localStorage.getItem("local_regs") || "[]")
            );
          }
        );
      } catch (e) {
        setRegistrations(
          JSON.parse(localStorage.getItem("local_regs") || "[]")
        );
      }
    }

    // 4. 기도제목 목록 실시간 동기화
    let unsubscribePrayers = () => {};
    if (user) {
      try {
        const prayersCol = collection(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "prayers"
        );
        unsubscribePrayers = onSnapshot(
          prayersCol,
          (snapshot) => {
            const list = [];
            snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
            setPrayers(list);
          },
          (err) => {
            console.error("기도제목 로드 에러:", err);
            setPrayers(
              JSON.parse(localStorage.getItem("local_prayers") || "[]")
            );
          }
        );
      } catch (e) {
        setPrayers(JSON.parse(localStorage.getItem("local_prayers") || "[]"));
      }
    }

    return () => {
      unsubscribeBanners();
      unsubscribeTshirt();
      unsubscribeRegs();
      unsubscribePrayers();
    };
  }, [user, isAdmin]);

  const loadFallbackBanners = () => {
    const localBanners = JSON.parse(
      localStorage.getItem("local_banners") || "[]"
    );
    if (localBanners.length > 0) {
      setBanners(
        localBanners.sort(
          (a, b) => Number(a.priority || 0) - Number(b.priority || 0)
        )
      );
    } else {
      setBanners(DEFAULT_BANNERS);
    }
  };

  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [banners]);

  useEffect(() => {
    if (currentSlide >= banners.length) {
      setCurrentSlide(0);
    }
  }, [banners, currentSlide]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const targetWidth = Math.min(img.width, 1024);
        const targetHeight = (targetWidth * 9) / 16;

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const imgRatio = img.width / img.height;
        const targetRatio = 16 / 9;
        let sx = 0,
          sy = 0,
          sWidth = img.width,
          sHeight = img.height;

        if (imgRatio > targetRatio) {
          sWidth = img.height * targetRatio;
          sx = (img.width - sWidth) / 2;
        } else {
          sHeight = img.width / targetRatio;
          sy = (img.height - sHeight) / 2;
        }

        ctx.drawImage(
          img,
          sx,
          sy,
          sWidth,
          sHeight,
          0,
          0,
          targetWidth,
          targetHeight
        );

        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
        setUploadPreview(compressedBase64);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleTshirtSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const targetWidth = Math.min(img.width, 800);
        const targetHeight = (img.height * targetWidth) / img.width;

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.75);
        setTshirtUploadPreview(compressedBase64);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const uploadBanner = async () => {
    if (!uploadPreview) return;
    const newBanner = {
      id: "banner_" + Date.now(),
      url: uploadPreview,
      priority: Number(uploadPriority) || 1,
    };

    try {
      if (user) {
        const bannersCol = collection(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "banners"
        );
        await addDoc(bannersCol, newBanner);
      } else {
        throw new Error("Offline");
      }
    } catch (e) {
      const local = JSON.parse(localStorage.getItem("local_banners") || "[]");
      local.push(newBanner);
      localStorage.setItem("local_banners", JSON.stringify(local));
      loadFallbackBanners();
    }

    setUploadPreview(null);
    setUploadPriority("1");
    if (fileInputRef.current) fileInputRef.current.value = "";
    triggerToast("배너 업로드가 완료되었습니다! 🎉", "success");
  };

  const deleteBanner = (bannerId) => {
    triggerConfirm(
      "선택한 배너를 캐러셀 목록에서 삭제하시겠습니까?",
      async () => {
        try {
          if (user && !bannerId.startsWith("banner_")) {
            const bannerDoc = doc(
              db,
              "artifacts",
              appId,
              "public",
              "data",
              "banners",
              bannerId
            );
            await deleteDoc(bannerDoc);
          } else {
            const local = JSON.parse(
              localStorage.getItem("local_banners") || "[]"
            );
            const filtered = local.filter((b) => b.id !== bannerId);
            localStorage.setItem("local_banners", JSON.stringify(filtered));
            loadFallbackBanners();
          }
          triggerToast("배너가 정상적으로 삭제되었습니다.", "success");
        } catch (e) {
          triggerToast("삭제 도중 오류가 발생했습니다.", "error");
        }
      }
    );
  };

  const uploadTshirtGuide = async () => {
    if (!tshirtUploadPreview) return;
    try {
      if (user) {
        const tshirtDocRef = doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "settings",
          "global"
        );
        await setDoc(
          tshirtDocRef,
          { tshirtGuideUrl: tshirtUploadPreview },
          { merge: true }
        );
      } else {
        throw new Error("Offline");
      }
      setTshirtGuideUrl(tshirtUploadPreview);
    } catch (e) {
      localStorage.setItem("local_tshirt_guide", tshirtUploadPreview);
      setTshirtGuideUrl(tshirtUploadPreview);
    }
    setTshirtUploadPreview(null);
    if (tshirtInputRef.current) tshirtInputRef.current.value = "";
    triggerToast("티셔츠 사이즈 조견표가 저장되었습니다! 👕", "success");
  };

  const deleteTshirtGuide = () => {
    triggerConfirm(
      "등록된 티셔츠 사이즈 조견표 이미지를 삭제하시겠습니까?",
      async () => {
        try {
          if (user) {
            const tshirtDocRef = doc(
              db,
              "artifacts",
              appId,
              "public",
              "data",
              "settings",
              "global"
            );
            await setDoc(
              tshirtDocRef,
              { tshirtGuideUrl: null },
              { merge: true }
            );
          }
          localStorage.removeItem("local_tshirt_guide");
          setTshirtGuideUrl(null);
          triggerToast("조견표 이미지가 초기화되었습니다.", "success");
        } catch (e) {
          triggerToast("삭제 도중 오류가 발생했습니다.", "error");
        }
      }
    );
  };

  const showRandomWord = () => {
    const promises = [
      "너는 범사에 그를 인정하라 그리하면 네 길을 지도하시리라 (잠 3:6)",
      "여호와는 나의 목자시니 내게 부족함이 없으리로다 (시 23:1)",
      "강하고 담대하라 두려워하지 말며 놀라지 말라 네가 어디로 가든지 네 하나님 여호와가 너와 함께 하느니라 (여호수아 1:9)",
      "아무 것도 염려하지 말고 다만 모든 일에 기도와 간구로 너희 구할 것을 감사함으로 하나님께 아뢰라 (빌 4:6)",
      "우리가 알거니와 하나님을 사랑하는 자 곧 그의 뜻대로 부르심을 입은 자들에게는 모든 것이 합력하여 선을 이루느니라 (롬 8:28)",
    ];
    const random = promises[Math.floor(Math.random() * promises.length)];
    setWordMessage(random);
    setShowWordPopup(true);
  };

  const handleApplySubmit = async (e) => {
    e.preventDefault();
    if (!formData.agreed) {
      triggerToast(
        "개인정보 수집 및 이용에 반드시 동의하셔야 신청이 가능합니다.",
        "error"
      );
      return;
    }
    if (!formData.childName || !formData.childClass || !formData.parentPhone) {
      triggerToast(
        "아이 이름, 소속 반, 연락처는 필수 작성 항목입니다.",
        "error"
      );
      return;
    }

    const payload = {
      ...formData,
      timestamp: new Date().toLocaleString(),
      status: "접수완료",
    };

    try {
      if (user) {
        const regsCol = collection(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "registrations"
        );
        await addDoc(regsCol, payload);
      } else {
        throw new Error("Offline");
      }
    } catch (err) {
      const local = JSON.parse(localStorage.getItem("local_regs") || "[]");
      local.push({ id: "local_" + Date.now(), ...payload });
      localStorage.setItem("local_regs", JSON.stringify(local));
    }

    triggerToast(
      "유치부 어드벤처 신청서가 성공적으로 접수되었습니다! 🎉",
      "success"
    );
    // 입력 폼 완벽 초기화
    setFormData({
      agreed: false,
      department: "유치1부 9:00",
      childName: "",
      childClass: "",
      parentPhone: "",
      tshirtSize: "14호",
      specialNotes: "",
      sponsor1: false,
      sponsor2: false,
      sponsor3: false,
      sponsor4: false,
      sponsor5: false,
    });
    setApplyStep(1);
    setActiveTab("main");
  };

  // 기도제목 폼 서브밋 핸들러 오류 완벽 수정 완료
  const handlePrayerSubmit = async (e) => {
    e.preventDefault();
    if (!prayerForm.content) {
      triggerToast("기도 제목 내용을 입력해 주세요.", "error");
      return;
    }

    const payload = {
      author: prayerForm.author.trim() || "무명 학부모",
      content: prayerForm.content.trim(),
      isPrivate: prayerForm.isPrivate,
      timestamp: new Date().toLocaleString(),
    };

    try {
      if (user) {
        const prayersCol = collection(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "prayers"
        );
        await addDoc(prayersCol, payload);
      } else {
        throw new Error("Offline");
      }
    } catch (err) {
      const local = JSON.parse(localStorage.getItem("local_prayers") || "[]");
      const localData = { id: "local_" + Date.now(), ...payload };
      local.push(localData);
      localStorage.setItem("local_prayers", JSON.stringify(local));
      setPrayers(local);
    }

    triggerToast("은혜로운 기도제목이 전달되었습니다. 🙏", "success");
    setPrayerForm({ author: "", content: "", isPrivate: true });
    setActiveTab("main"); // 전송 성공 후 메인 탭으로 복귀
  };

  const deletePrayer = (prayerId) => {
    triggerConfirm("기도제목을 정말로 삭제하시겠습니까?", async () => {
      try {
        if (user && !prayerId.startsWith("local_")) {
          const pDoc = doc(
            db,
            "artifacts",
            appId,
            "public",
            "data",
            "prayers",
            prayerId
          );
          await deleteDoc(pDoc);
        } else {
          const local = JSON.parse(
            localStorage.getItem("local_prayers") || "[]"
          );
          const filtered = local.filter((p) => p.id !== prayerId);
          localStorage.setItem("local_prayers", JSON.stringify(filtered));
          setPrayers(filtered);
        }
        triggerToast("기도제목이 삭제되었습니다.", "success");
      } catch (e) {
        triggerToast("삭제 실패", "error");
      }
    });
  };

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPassword === "6579") {
      setIsAdmin(true);
      setAdminError("");
      triggerToast("대시보드 인증 성공!", "success");
    } else {
      setAdminError("올바르지 않은 마스터 비밀번호입니다.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex justify-center pb-20 relative">
      <div className="w-full max-w-md bg-white min-h-screen shadow-lg relative flex flex-col">
        {/* 상단 헤더 바 */}
        <header className="sticky top-0 z-40 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setActiveTab("main")}
          >
            <div className="relative">
              <img
                src="/620218488.png"
                alt="인천온누리교회"
                className="h-10 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  document
                    .getElementById("logo-fallback-nav")
                    .classList.remove("hidden");
                }}
              />
              <div
                id="logo-fallback-nav"
                className="hidden flex items-center bg-[#00409c] text-white text-[10px] font-bold px-2 py-1 rounded"
              >
                인천 온누리교회
              </div>
            </div>

            <div className="border-l border-slate-200 pl-2 h-7 flex flex-col justify-center">
              <span className="text-xs text-slate-400 font-semibold tracking-wide">
                인천온누리교회
              </span>
              <span className="text-sm font-extrabold text-[#00409c] tracking-tight">
                유치부 어드벤처
              </span>
            </div>
          </div>

          {activeTab === "admin" ? (
            <button
              onClick={() => {
                setActiveTab("main");
                setIsAdmin(false);
                setAdminPassword("");
              }}
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-lg hover:bg-slate-200 transition"
              title="홈으로 가기"
            >
              🏠
            </button>
          ) : (
            <button
              onClick={() => setActiveTab("admin")}
              className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-sm shadow-sm hover:scale-105 active:scale-95 transition"
              title="관리자 모드"
            >
              🔑
            </button>
          )}
        </header>

        {/* 메인 뷰 제어 */}
        <main className="flex-1">
          {/* 메인 허브 화면 */}
          {activeTab === "main" && (
            <div className="animate-fade-in">
              <div className="relative w-full aspect-video bg-slate-100 overflow-hidden shadow-inner">
                <div
                  className="flex w-full h-full transition-transform duration-500 ease-in-out"
                  style={{ transform: `translateX(-${currentSlide * 100}%)` }}
                >
                  {banners.map((slide) => (
                    <div
                      key={slide.id}
                      className="w-full h-full shrink-0 relative"
                    >
                      <img
                        src={slide.url}
                        alt="배너"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src =
                            "https://images.unsplash.com/photo-1502082553048-f009c37129b9?q=80&w=1200&auto=format&fit=crop";
                        }}
                      />
                    </div>
                  ))}
                </div>

                {banners.length > 1 && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                    {banners.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentSlide(idx)}
                        className={`w-2 h-2 rounded-full transition-all ${
                          idx === currentSlide
                            ? "bg-[#00409c] w-4"
                            : "bg-white/75"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* 말씀 위젯 */}
              <div className="mx-4 mt-4">
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-3.5 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📖</span>
                    <div>
                      <h4 className="text-xs font-bold text-amber-800">
                        오늘의 약속 말씀
                      </h4>
                      <p className="text-xs text-amber-700/90 line-clamp-1 mt-0.5 font-medium">
                        너는 범사에 그를 인정하라 그리하면 네 길을
                        지도하시리라...
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={showRandomWord}
                    className="text-xs font-bold bg-white text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg active:scale-95 transition"
                  >
                    읽기
                  </button>
                </div>
              </div>

              {/* 가시성 극대화 2버튼 시스템 */}
              <div className="grid grid-cols-2 gap-3.5 p-4">
                <button
                  onClick={() => {
                    setActiveTab("apply");
                    setApplyStep(1);
                  }}
                  className="bg-gradient-to-br from-sky-400 to-sky-500 text-white rounded-2xl p-5 shadow-md flex flex-col items-center justify-center hover:scale-105 active:scale-95 transition"
                >
                  <span className="text-3xl mb-2">🏕️</span>
                  <span className="font-extrabold text-sm text-center">
                    유치부 어드벤처 신청
                  </span>
                  <span className="text-[10px] text-sky-100 mt-1">
                    참가 접수 및 안내사항
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("prayer")}
                  className="bg-gradient-to-br from-teal-400 to-teal-500 text-white rounded-2xl p-5 shadow-md flex flex-col items-center justify-center hover:scale-105 active:scale-95 transition"
                >
                  <span className="text-3xl mb-2">🙏</span>
                  <span className="font-extrabold text-sm text-center">
                    기도제목 작성
                  </span>
                  <span className="text-[10px] text-teal-100 mt-1">
                    선생님과 실시간 공유
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* 수련회 신청 및 수집 정보 작성 탭 */}
          {activeTab === "apply" && (
            <div className="p-5 animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setActiveTab("main")}
                  className="text-lg"
                >
                  ⬅️
                </button>
                <h3 className="text-lg font-extrabold text-[#00409c]">
                  어드벤처 참가 신청
                </h3>
              </div>

              {/* 1단계: 수련회 안내 정보 */}
              {applyStep === 1 && (
                <div className="space-y-4">
                  <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm">
                    <div className="flex justify-center mb-3">
                      <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 text-2xl">
                        🌊
                      </span>
                    </div>
                    <h3 className="text-center font-extrabold text-base text-[#00409c] mb-1">
                      "여호수아, 약속의 땅으로"
                    </h3>
                    <p className="text-center text-xs text-slate-500 font-bold mb-4">
                      인천온누리교회 유치부 여름 어드벤처
                    </p>

                    <div className="space-y-3.5 border-t border-dashed border-slate-100 pt-4 text-xs text-slate-600">
                      <div className="bg-slate-50 rounded-xl p-3">
                        <strong className="text-[#00409c] block mb-1">
                          💡 초대의 글
                        </strong>
                        <p className="leading-relaxed text-[11px] break-keep font-medium">
                          할렐루야!
                          <br />
                          <br />
                          믿음의 자녀들이 광야를 건너 여호수아와 같이
                          <br />
                          담대한 믿음으로 나아가는 시간이 될 것입니다.
                          <br />
                          <br />
                          이번 여름, 말씀과 풍성한 활동으로
                          <br />
                          우리 아이들의 영성과 지성이 쑥쑥 자라나는
                          <br />
                          어드벤처의 현장에 우리 유치부 어린이들을 초대합니다.
                          <br />
                        </p>
                      </div>

                      <div className="space-y-1.5 px-1 leading-relaxed">
                        <div>
                          📅 <strong className="text-slate-800">날짜:</strong>{" "}
                          2026년 7월 25일 (토) 오전 10시-오후 4시
                        </div>
                        <div>
                          📍 <strong className="text-slate-800">장소:</strong>{" "}
                          온누리교회 인천캠퍼스 1층 꿈아이홀
                        </div>
                        <div>
                          💰 <strong className="text-slate-800">등록비:</strong>{" "}
                          30,000원(7월 5일 마감)
                        </div>
                      </div>

                      <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3">
                        <strong className="text-amber-800 block mb-1">
                          🏦 납부 계좌 안내
                        </strong>
                        <p className="text-[11px] text-amber-900 leading-normal">
                          카카오뱅크{" "}
                          <span className="font-extrabold underline">
                            3333-34-1920814
                          </span>{" "}
                          (예금주: 최경아)
                          <br />
                          <span className="text-[10px] text-amber-700/95">
                            * 송금 시 반드시 "아이이름+연락처 뒷번호 4자리" (예:
                            이예꿈1234) 로 기재해 주세요.
                          </span>
                        </p>
                      </div>

                      {/* 실시간 연락 가능한 안내 번호 */}
                      <div className="pt-2 space-y-1.5">
                        <a
                          href="tel:01052676579"
                          className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100 active:scale-98 transition"
                        >
                          <div className="text-left">
                            <span className="text-[9px] font-bold text-slate-400 block">
                              유치부 총괄
                            </span>
                            <span className="text-xs font-extrabold text-slate-800">
                              옥준우 전도사
                            </span>
                          </div>
                          <span className="text-[10px] bg-sky-50 text-sky-600 px-2.5 py-1 rounded font-bold">
                            전화 걸기 📞
                          </span>
                        </a>
                        <a
                          href="tel:01091534243"
                          className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100 active:scale-98 transition"
                        >
                          <div className="text-left">
                            <span className="text-[9px] font-bold text-slate-400 block">
                              유치1부 담당
                            </span>
                            <span className="text-xs font-extrabold text-slate-800">
                              김용숙 코치
                            </span>
                          </div>
                          <span className="text-[10px] bg-sky-50 text-sky-600 px-2.5 py-1 rounded font-bold">
                            전화 걸기 📞
                          </span>
                        </a>
                        <a
                          href="tel:01045259057"
                          className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100 active:scale-98 transition"
                        >
                          <div className="text-left">
                            <span className="text-[9px] font-bold text-slate-400 block">
                              유치2부 담당
                            </span>
                            <span className="text-xs font-extrabold text-slate-800">
                              오지민 코치
                            </span>
                          </div>
                          <span className="text-[10px] bg-sky-50 text-sky-600 px-2.5 py-1 rounded font-bold">
                            전화 걸기 📞
                          </span>
                        </a>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setApplyStep(2)}
                    className="w-full py-3.5 bg-gradient-to-r from-sky-400 to-sky-500 text-white font-extrabold rounded-xl shadow-md text-xs active:scale-95 transition flex items-center justify-center gap-1"
                  >
                    상세 인적사항 작성하기 ➔
                  </button>
                </div>
              )}

              {/* 2단계: 신청서 작성 */}
              {applyStep === 2 && (
                <form
                  onSubmit={handleApplySubmit}
                  className="space-y-4 text-xs"
                >
                  {/* 1. 개인정보 수집 및 이용 동의 */}
                  <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl">
                    <h4 className="text-xs font-extrabold text-slate-800 mb-2.5 flex items-center gap-1">
                      <span>🔒</span> 개인정보 수집 및 이용 동의
                    </h4>
                    <label className="flex items-center gap-2.5 cursor-pointer bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                      <input
                        type="checkbox"
                        required
                        checked={formData.agreed}
                        onChange={(e) =>
                          setFormData({ ...formData, agreed: e.target.checked })
                        }
                        className="w-5 h-5 text-sky-500 border-slate-300 rounded focus:ring-sky-400"
                      />
                      <span className="text-[11px] font-bold text-slate-700 select-none">
                        개인정보 수집 및 이용에 동의하십니까? *
                      </span>
                    </label>
                  </div>

                  {/* 2. 부서 선택 */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">
                      부서 선택 *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            department: "유치1부 9:00",
                          })
                        }
                        className={`p-3 rounded-xl border text-xs font-extrabold transition-all text-center ${
                          formData.department === "유치1부 9:00"
                            ? "bg-sky-500 text-white border-sky-500 shadow-sm"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        유치1부 (오전 9:00)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            department: "유치2부 11:30",
                          })
                        }
                        className={`p-3 rounded-xl border text-xs font-extrabold transition-all text-center ${
                          formData.department === "유치2부 11:30"
                            ? "bg-sky-500 text-white border-sky-500 shadow-sm"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        유치2부 (오전 11:30)
                      </button>
                    </div>
                  </div>

                  {/* 3. 아이 이름과 소속 반 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        아이 이름 *
                      </label>
                      <input
                        type="text"
                        placeholder="예: 이예꿈"
                        required
                        value={formData.childName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            childName: e.target.value,
                          })
                        }
                        className="w-full border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50/50 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        소속 반 *
                      </label>
                      <input
                        type="text"
                        placeholder="예: 다윗반/나이"
                        required
                        value={formData.childClass}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            childClass: e.target.value,
                          })
                        }
                        className="w-full border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50/50 font-bold"
                      />
                    </div>
                  </div>

                  {/* 4. 부모 연락처 */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      부모 연락처 *
                    </label>
                    <input
                      type="tel"
                      placeholder="예: 010-1234-5678"
                      required
                      value={formData.parentPhone}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          parentPhone: e.target.value,
                        })
                      }
                      className="w-full border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50/50 font-bold"
                    />
                  </div>

                  {/* 티셔츠 사이즈 선택 및 실시간 조견표 연계 */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block font-bold text-slate-700">
                        티셔츠 사이즈 선택 *
                      </label>
                      {tshirtGuideUrl && (
                        <span className="text-[10px] text-[#00409c] font-bold">
                          👕 아래 가이드 사진을 참고해 주세요
                        </span>
                      )}
                    </div>

                    {tshirtGuideUrl && (
                      <div className="mb-3 border border-slate-150 rounded-xl overflow-hidden bg-slate-50 p-1.5 shadow-inner">
                        <img
                          src={tshirtGuideUrl}
                          alt="티셔츠 사이즈 가이드"
                          className="w-full max-h-56 object-contain rounded-lg mx-auto"
                        />
                      </div>
                    )}

                    {/* 14호~18호 직관적인 5개 버튼형 인터페이스 설계 */}
                    <div className="grid grid-cols-5 gap-2">
                      {["14호", "15호", "16호", "17호", "18호"].map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() =>
                            setFormData({ ...formData, tshirtSize: size })
                          }
                          className={`py-3 rounded-xl border text-xs font-black transition-all text-center ${
                            formData.tshirtSize === size
                              ? "bg-[#00409c] border-[#00409c] text-white shadow-md scale-105"
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2026 추가: 어드벤처 후원 및 섬김 약정 */}
                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 space-y-3">
                    <div>
                      <h4 className="text-xs font-extrabold text-emerald-950 flex items-center gap-1">
                        어드벤처 후원 및 섬김 약정 (중복 선택 가능)
                      </h4>
                    </div>
                    <div className="space-y-2 pt-1.5 text-[11px] font-semibold text-slate-700">
                      <label className="flex items-center gap-2.5 cursor-pointer bg-white/70 p-2.5 rounded-lg border border-slate-100 hover:bg-white transition-all">
                        <input
                          type="checkbox"
                          checked={formData.sponsor1}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              sponsor1: e.target.checked,
                            })
                          }
                          className="w-4.5 h-4.5 text-[#00409c] border-slate-300 rounded focus:ring-[#00409c]"
                        />
                        <span>일일보조교사(부) 9:00-15:00 🙋‍♂️</span>
                      </label>
                      <label className="flex items-center gap-2.5 cursor-pointer bg-white/70 p-2.5 rounded-lg border border-slate-100 hover:bg-white transition-all">
                        <input
                          type="checkbox"
                          checked={formData.sponsor2}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              sponsor2: e.target.checked,
                            })
                          }
                          className="w-4.5 h-4.5 text-[#00409c] border-slate-300 rounded focus:ring-[#00409c]"
                        />
                        <span>일일보조교사(모) 9:00-15:00 🙋‍♀️</span>
                      </label>
                      <label className="flex items-center gap-2.5 cursor-pointer bg-white/70 p-2.5 rounded-lg border border-slate-100 hover:bg-white transition-all">
                        <input
                          type="checkbox"
                          checked={formData.sponsor3}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              sponsor3: e.target.checked,
                            })
                          }
                          className="w-4.5 h-4.5 text-[#00409c] border-slate-300 rounded focus:ring-[#00409c]"
                        />
                        <span>물놀이&정리도우미 13:00-16:00 🌊</span>
                      </label>
                      <label className="flex items-center gap-2.5 cursor-pointer bg-white/70 p-2.5 rounded-lg border border-slate-100 hover:bg-white transition-all">
                        <input
                          type="checkbox"
                          checked={formData.sponsor4}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              sponsor4: e.target.checked,
                            })
                          }
                          className="w-4.5 h-4.5 text-[#00409c] border-slate-300 rounded focus:ring-[#00409c]"
                        />
                        <span>어드벤처 재정후원 💸</span>
                      </label>
                      <label className="flex items-center gap-2.5 cursor-pointer bg-white/70 p-2.5 rounded-lg border border-slate-100 hover:bg-white transition-all">
                        <input
                          type="checkbox"
                          checked={formData.sponsor5}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              sponsor5: e.target.checked,
                            })
                          }
                          className="w-4.5 h-4.5 text-[#00409c] border-slate-300 rounded focus:ring-[#00409c]"
                        />
                        <span>기도 및 필사섬김 ✍️</span>
                      </label>
                    </div>
                  </div>

                  {/* 5. 아이 특이사항 및 알러지 주의해야 할 음식 */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      아이 특이사항 및 알러지 주의해야 할 음식
                    </label>
                    <textarea
                      placeholder="식품 알레르기(땅콩, 계란, 유제품 등) 또는 아동 안전 관리를 위해 선생님들이 신경 써야 할 점을 자유롭게 남겨 주세요."
                      value={formData.specialNotes}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          specialNotes: e.target.value,
                        })
                      }
                      className="w-full border border-slate-200 rounded-lg p-2.5 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50/50"
                    />
                  </div>

                  {/* 전송 액션 */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setApplyStep(1)}
                      className="w-1/3 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition"
                    >
                      돌아가기
                    </button>
                    <button
                      type="submit"
                      className="w-2/3 py-3 bg-gradient-to-r from-sky-400 to-sky-500 text-white font-extrabold rounded-xl shadow-md hover:opacity-90 active:scale-95 transition"
                    >
                      캠프 신청 완료하기
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* 중보 기도제목 나누기 탭 (완벽 연동 및 뷰 에러 수정 완료) */}
          {activeTab === "prayer" && (
            <main className="flex-1 bg-white p-5 pb-12 animate-fade-in">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <button
                  onClick={() => setActiveTab("main")}
                  className="text-slate-500 hover:text-slate-800 text-xs font-bold flex items-center gap-1"
                >
                  ⬅️ 홈으로 가기
                </button>
                <span className="text-xs text-stone-200">|</span>
                <h2 className="text-xs font-bold text-slate-800">
                  기도제목 나누기
                </h2>
              </div>

              <div className="bg-teal-50 border border-teal-100/75 rounded-xl p-4 mb-5 break-keep">
                <span className="text-xl">🙏</span>
                <p className="text-xs text-teal-950 font-bold mt-1.5 leading-relaxed">
                  "두세 사람이 내 이름으로 모인 곳에는 나도 그들 중에 있느니라"
                  (마태복음 18:20)
                </p>
                <p className="text-[10px] text-teal-800 leading-relaxed mt-2 font-medium">
                  아이의 성격, 건강, 가정의 고민, 진로 등 어떤 기도 제목이든
                  마음 편히 나누어 주세요. 등록된 기도제목은 교역자 및 담당
                  코치만 확인하고 중보기도합니다.
                </p>
              </div>

              <form onSubmit={handlePrayerSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    학부모 이름 (또는 자녀 이름)
                  </label>
                  <input
                    type="text"
                    placeholder="예: 예꿈이 아빠 / 김꿈땅 (기입하지 않을 시 무명으로 전송)"
                    value={prayerForm.author}
                    onChange={(e) =>
                      setPrayerForm({ ...prayerForm, author: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-teal-400 bg-slate-50/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    기도 내용 *
                  </label>
                  <textarea
                    rows="6"
                    placeholder="아이와 가정을 위해 마음을 나누고 싶은 중보기도를 상세하게 작성해 주시면 중보하겠습니다."
                    required
                    value={prayerForm.content}
                    onChange={(e) =>
                      setPrayerForm({ ...prayerForm, content: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-teal-400 bg-slate-50/50 resize-none"
                  />
                </div>

                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-150 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold block text-slate-800">
                      비공개 및 보안 유지
                    </span>
                    <span className="text-[9px] text-slate-500 block">
                      체크 상태 유지 시 교역자 외에는 절대 열람되지 않습니다.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={prayerForm.isPrivate}
                    onChange={(e) =>
                      setPrayerForm({
                        ...prayerForm,
                        isPrivate: e.target.checked,
                      })
                    }
                    className="w-4.5 h-4.5 text-teal-600 border-slate-300 rounded focus:ring-teal-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-extrabold py-3.5 rounded-xl shadow-md transition-all mt-4 text-xs"
                >
                  기도 제목 전송하기 🙏
                </button>
              </form>
            </main>
          )}

          {/* 마스터 교사 관리자 대시보드 탭 */}
          {activeTab === "admin" && (
            <div className="p-5 animate-fade-in">
              <h3 className="text-lg font-extrabold text-slate-800 mb-4 flex items-center gap-1">
                🔑 교역자 관리시스템
              </h3>

              {!isAdmin ? (
                <form onSubmit={handleAdminLogin} className="space-y-4 text-xs">
                  <div className="bg-slate-50 p-3.5 border border-slate-200 rounded-xl text-slate-600 leading-relaxed font-medium">
                    비밀번호를 입력해 주십시오.
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      인증 비밀번호
                    </label>
                    <input
                      type="password"
                      placeholder="비밀번호 4자리"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2.5 focus:outline-none"
                    />
                  </div>
                  {adminError && (
                    <p className="text-red-500 text-[11px]">{adminError}</p>
                  )}
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#00409c] text-white font-bold rounded-lg"
                  >
                    대시보드 로그인
                  </button>
                </form>
              ) : (
                <div className="space-y-6 text-xs">
                  {/* 대시보드 요약카드 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-sky-50 border border-sky-100 p-3 rounded-lg text-center">
                      <span className="text-[10px] text-sky-600 block font-bold">
                        참가신청 누적
                      </span>
                      <strong className="text-lg text-sky-800 font-black">
                        {registrations.length}건
                      </strong>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg text-center">
                      <span className="text-[10px] text-emerald-600 block font-bold">
                        기도제목 접수
                      </span>
                      <strong className="text-lg text-emerald-800 font-black">
                        {prayers.length}건
                      </strong>
                    </div>
                  </div>

                  {/* 티셔츠 가이드 이미지 실시간 업로드 및 원격 바인딩 추가 */}
                  <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50/30">
                    <h4 className="font-extrabold text-indigo-950 text-sm mb-1.5 flex items-center gap-1">
                      <span>👕</span> 티셔츠 사이즈 가이드 이미지 관리
                    </h4>
                    <p className="text-[10px] text-indigo-800/80 mb-3 font-semibold leading-relaxed">
                      학부모 신청서 작성 화면에 실시간으로 노출될 가이드 치수표
                      이미지를 업로드하고 제어합니다.
                    </p>

                    <div className="space-y-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          가이드 사진 선택
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          ref={tshirtInputRef}
                          onChange={handleTshirtSelect}
                          className="w-full text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white"
                        />
                      </div>

                      {tshirtUploadPreview && (
                        <div className="border border-indigo-200 rounded-lg p-2 bg-white">
                          <p className="text-[10px] text-indigo-400 mb-1 font-bold">
                            업로드 대기중 미리보기
                          </p>
                          <img
                            src={tshirtUploadPreview}
                            alt="Tshirt preview"
                            className="w-full max-h-48 object-contain rounded"
                          />
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={uploadTshirtGuide}
                          disabled={!tshirtUploadPreview}
                          className="w-2/3 py-2 bg-indigo-600 text-white font-bold rounded-lg disabled:opacity-50"
                        >
                          사이즈 가이드 등록/수정하기
                        </button>
                        {tshirtGuideUrl && (
                          <button
                            onClick={deleteTshirtGuide}
                            className="w-1/3 py-2 bg-red-100 text-red-700 border border-red-200 font-bold rounded-lg hover:bg-red-200"
                          >
                            가이드 제거
                          </button>
                        )}
                      </div>

                      {tshirtGuideUrl && !tshirtUploadPreview && (
                        <div className="border border-slate-200 rounded-lg p-2 bg-white text-center">
                          <p className="text-[10px] text-slate-400 mb-1">
                            현재 활성화된 가이드 이미지
                          </p>
                          <img
                            src={tshirtGuideUrl}
                            alt="Active Guide"
                            className="w-full max-h-48 object-contain rounded mx-auto"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 캐러셀 동적 이미지 업로드 */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                    <h4 className="font-extrabold text-slate-800 text-sm mb-3">
                      🖼️ 캐러셀 동적 이미지 업로드
                    </h4>

                    <div className="space-y-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          1) 사진 파일 선택
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          ref={fileInputRef}
                          onChange={handleFileSelect}
                          className="w-full text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#00409c] file:text-white"
                        />
                      </div>

                      {uploadPreview && (
                        <div className="border border-slate-200 rounded-lg p-2 bg-white">
                          <p className="text-[10px] text-slate-400 mb-1">
                            업로드 미리보기 (16:9 가로 압축본)
                          </p>
                          <img
                            src={uploadPreview}
                            alt="업로드 프리뷰"
                            className="w-full aspect-video object-cover rounded"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          2) 노출 순서 (우선순위)
                        </label>
                        <input
                          type="number"
                          placeholder="예: 1 (낮을수록 먼저 노출)"
                          value={uploadPriority}
                          onChange={(e) => setUploadPriority(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg p-2 bg-white focus:outline-none"
                        />
                      </div>

                      <button
                        onClick={uploadBanner}
                        disabled={!uploadPreview}
                        className="w-full py-2 bg-[#00409c] text-white font-bold rounded-lg disabled:opacity-50"
                      >
                        신규 캐러셀 배너 게시하기
                      </button>
                    </div>

                    {/* 배너 삭제 리스트 */}
                    <div className="mt-4 border-t border-slate-200 pt-3">
                      <p className="font-bold text-slate-600 mb-2">
                        활성화된 배너 리스트
                      </p>
                      <div className="space-y-1.5">
                        {banners.map((b) => (
                          <div
                            key={b.id}
                            className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-1.5 px-3"
                          >
                            <span className="truncate max-w-[180px] font-medium text-[11px]">
                              순서: {b.priority || "기본"} -{" "}
                              {b.url.startsWith("data:")
                                ? "모바일 업로드 파일"
                                : "웹 제공 이미지"}
                            </span>
                            <button
                              onClick={() => deleteBanner(b.id)}
                              className="text-red-500 font-bold hover:underline"
                            >
                              삭제
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 수집 데이터: 참가자 명단 명부 */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm">
                    <h4 className="font-extrabold text-slate-800 text-sm mb-3">
                      🏕️ 참가자 명단 ({registrations.length}명)
                    </h4>
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {registrations.length === 0 ? (
                        <p className="text-slate-400 text-center py-4">
                          신청된 이력이 없습니다.
                        </p>
                      ) : (
                        registrations.map((reg) => (
                          <div
                            key={reg.id}
                            className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-[11px] relative"
                          >
                            <div className="flex justify-between font-bold text-slate-800">
                              <span>
                                👧 {reg.childName} ({reg.department} /{" "}
                                {reg.childClass || "반 미지정"})
                              </span>
                              <span className="text-[#00409c] bg-blue-50 px-2 py-0.5 rounded-full">
                                {reg.tshirtSize}호
                              </span>
                            </div>
                            <div className="text-slate-500 mt-1 font-semibold">
                              연락처: {reg.parentPhone}
                            </div>
                            {reg.specialNotes && (
                              <div className="mt-2 bg-amber-50 border border-amber-100 p-2 rounded text-amber-800 break-keep font-medium leading-relaxed">
                                <strong>알러지 및 특이사항:</strong>{" "}
                                {reg.specialNotes}
                              </div>
                            )}
                            <div className="mt-2.5 pt-2 border-t border-dashed border-slate-200">
                              <h5 className="text-[9px] font-extrabold text-[#00409c] mb-1">
                                💝 어드벤처 동참 약정 현황:
                              </h5>
                              <ul className="text-[9px] text-slate-500 space-y-0.5 font-semibold">
                                {reg.sponsor1 && (
                                  <li>• 일일보조교사(부) 9:00-15:00</li>
                                )}
                                {reg.sponsor2 && (
                                  <li>• 일일보조교사(모) 9:00-15:00</li>
                                )}
                                {reg.sponsor3 && (
                                  <li>• 물놀이&정리도우미 13:00-16:00</li>
                                )}
                                {reg.sponsor4 && <li>• 어드벤처 재정후원</li>}
                                {reg.sponsor5 && <li>• 기도 및 필사섬김</li>}
                                {!reg.sponsor1 &&
                                  !reg.sponsor2 &&
                                  !reg.sponsor3 &&
                                  !reg.sponsor4 &&
                                  !reg.sponsor5 && (
                                    <li className="text-slate-300">
                                      • 약정 없음
                                    </li>
                                  )}
                              </ul>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* 수집 데이터: 들어온 기도제목 명부 */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm">
                    <h4 className="font-extrabold text-slate-800 text-sm mb-3">
                      🙏 접수된 중보기도제목 ({prayers.length}개)
                    </h4>
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {prayers.length === 0 ? (
                        <p className="text-slate-400 text-center py-4">
                          기도제목이 비어 있습니다.
                        </p>
                      ) : (
                        prayers.map((p) => (
                          <div
                            key={p.id}
                            className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-[11px] relative"
                          >
                            <div className="flex justify-between font-bold text-slate-800">
                              <span>
                                👤 {p.author} {p.isPrivate ? "🔒" : "🔓"}
                              </span>
                              <button
                                onClick={() => deletePrayer(p.id)}
                                className="text-red-500 font-bold hover:underline"
                              >
                                삭제
                              </button>
                            </div>
                            <p className="text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed">
                              {p.content}
                            </p>
                            <span className="text-[9px] text-slate-400 block mt-1">
                              {p.timestamp}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* 저작권 푸터 */}
        <footer className="w-full bg-slate-100 py-3.5 border-t border-slate-200 text-center text-[10px] text-slate-400 mt-auto font-medium">
          <p>© 2026 인천온누리교회 유치부 어드벤처</p>
          <p className="mt-0.5 font-bold text-[#00409c]">
            "여호수아, 약속의 땅으로"
          </p>
        </footer>

        {/* 말씀 모달 팝업 */}
        {showWordPopup && (
          <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center shadow-2xl border-2 border-amber-300">
              <div className="text-4xl mb-3">🕊️</div>
              <h3 className="font-black text-amber-800 mb-2 text-sm">
                자녀를 향한 하나님의 복된 약속
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed break-keep font-medium bg-amber-50 rounded-xl p-4 my-4">
                "{wordMessage}"
              </p>
              <button
                onClick={() => setShowWordPopup(false)}
                className="w-full py-2.5 bg-amber-700 text-white font-extrabold rounded-lg hover:bg-amber-800 active:scale-95 transition text-xs"
              >
                아멘
              </button>
            </div>
          </div>
        )}

        {/* 커스텀 토스트 알림 컴포넌트 */}
        {toast.show && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white text-xs font-bold px-5 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-bounce">
            <span>{toast.type === "success" ? "✅" : "❌"}</span>
            <span>{toast.message}</span>
          </div>
        )}

        {/* 커스텀 컨펌 모달 컴포넌트 */}
        {confirmModal.show && (
          <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-white p-5 rounded-2xl w-full max-w-xs text-center shadow-2xl">
              <span className="text-3xl block mb-2">❓</span>
              <p className="text-xs font-bold text-slate-800 leading-relaxed mb-4 whitespace-pre-wrap">
                {confirmModal.message}
              </p>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() =>
                    setConfirmModal({
                      show: false,
                      message: "",
                      onConfirm: null,
                    })
                  }
                  className="w-1/2 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-lg"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    if (confirmModal.onConfirm) confirmModal.onConfirm();
                    setConfirmModal({
                      show: false,
                      message: "",
                      onConfirm: null,
                    });
                  }}
                  className="w-1/2 py-2.5 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
