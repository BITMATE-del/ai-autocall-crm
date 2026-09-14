# AutoCall Android Gateway Agent

투자/MVP용 자체 Android Gateway 에이전트입니다. 외부 전화 API를 사용하지 않고 회사가 사용권한을 가진 SIM 단말이 서버의 발신 Queue를 소비합니다.

## 현재 프로토콜

1. 관리자 `/devices`에서 Android 단말 등록 → 8자리 pairing code 발급
2. Agent `POST /api/gateway/pair` → deviceId + 1회 발급 token 수신/로컬 저장
3. 10초 간격 `POST /api/gateway/heartbeat`
4. 유휴 상태에서 `POST /api/gateway/next-job`
5. 작업 수신 시 Android `TelecomManager.placeCall()`로 발신
6. Agent가 `DIALING / CONNECTED / COMPLETED / FAILED`를 `/api/gateway/report`로 전송
7. 서버는 Queue/Lead/Device 상태를 동기화하고 다음 작업을 lease합니다.

## 보안/운영 원칙

- 회사가 소유하거나 적법한 사용권한이 있는 SIM/번호만 사용
- DNC는 서버에서 job lease 이전에 차단
- 한 Queue는 한 단말에만 90초 lease
- token 원문은 DB에 저장하지 않고 SHA-256 hash만 저장
- 번호 회전/스팸필터 우회/Android 오디오 제한 우회 기능은 구현하지 않음

## 중요한 제한

Android 공개 API만으로 통화 송화 채널에 임의 TTS/미디어 오디오를 주입하거나 상대방 음성을 안정적으로 캡처하는 기능은 기종/OS별로 보장되지 않습니다. 따라서 Agent 프로토콜은 `audioInjection`/`remoteAudioCapture` capability를 별도로 두고, 지원이 검증된 하드웨어에서만 활성화하도록 설계합니다.

아래 Kotlin 코드는 MVP Agent의 핵심 흐름을 보여주는 기준 구현입니다. 실제 APK 빌드 시 Android Studio 프로젝트로 옮기거나 이 폴더를 별도 Gradle 모듈로 사용하면 됩니다.
