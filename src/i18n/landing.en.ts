/**
 * 랜딩 영어 사전 — **말투가 다른 이유가 있다.**
 *
 * 방문자·주최자 사전은 앱 안의 말이고, 여기는 **아직 안 산 사람이 맡길지 말지 정하는 자리**의
 * 말이다. 한국어 원문이 앱 전체의 해요체를 깨고 혼자 합니다체인 것도 같은 이유다
 * (`landingData.ts` 머리말). 그래서 영어도 담백한 서술체로 간다 — 느낌표를 안 쓰고,
 * "we" 대신 "I" 를 쓴다(개인이 혼자 받는 커미션이라 그게 사실이다).
 *
 * **서비스 이름은 앱 사전과 다를 수 있다.** 앱에서는 화면 안의 기능 이름이고 여기서는
 * 파는 물건의 이름이라, 여기 있는 값이 이긴다 (`index.tsx` 의 DICTS 합치는 순서).
 */

export const LANDING_EN: Record<string, string> = {
  // ── 서비스 열 가지 ────────────────────────────────
  '타로카드': 'Tarot cards',
  '궁금한 질문을 고르면 카드를 뽑고 해석을 보여줍니다.':
    'Visitors pick a question, draw a card, and read what it means.',
  '3장 뽑기의 AI 종합 리딩은 체험에서는 꺼 뒀습니다. 카드별 해석은 그대로 나옵니다.':
    'The AI reading for three-card spreads is off in this demo. Each card still shows its own meaning.',

  '럭키드로우': 'Lucky draw',
  '스태프가 직접 경품을 뽑습니다. 등수, 잔여 재고 확인, 스크래치 연출까지 모두 지원합니다.':
    'Staff draw the prizes themselves. Ranks, remaining stock and a scratch-off reveal are all included.',
  '상품 넷에 재고 3·20·120·300으로 채워 뒀습니다. 관리 화면도 열려 있어 수량을 직접 바꿔 보실 수 있습니다.':
    'Four prizes are set up with stocks of 3, 20, 120 and 300. The admin screen is open too, so you can change the numbers yourself.',

  '포토카드 뽑기': 'Photocard draw',
  '랜덤 포토카드 뽑기입니다. 이미지 저장용, 실물 1장 증정용, 판매용 등 세 가지 방식으로 운영할 수 있습니다.':
    'A random photocard draw. It runs three ways: save-the-image only, one physical card as a gift, or for sale.',
  '방문자 폰은 저장용(1인 3장), 스태프 기기는 판매용(한 번에 10장)으로 맞춰 뒀습니다.':
    'The visitor phone is set to save-only (3 per person) and the staff tablet to for-sale (10 at a time).',

  '롤링페이퍼': 'Message wall',
  '팬들이 남긴 소중한 축하 메시지가 화면에 한 장씩 채워집니다.':
    'The messages fans leave fill the screen one note at a time.',

  '소원 나무': 'Wish tree',
  '소원을 적어 등불로 매다는, 감성적인 밤하늘 버전의 롤링페이퍼입니다.':
    'A night-sky version of the message wall — write a wish and hang it as a lantern.',

  '포토존 프레임': 'Photo zone frame',
  '촬영한 사진에 행사 전용 프레임을 씌워 저장할 수 있습니다.':
    'Photos are framed with your event artwork and saved to the phone.',

  '영상회 응원': 'Screening cheers',
  '팬들이 남긴 응원 문구가 상영 스크린에 말풍선으로 떠오릅니다.':
    'Cheers from fans float across the screening as speech bubbles.',

  '실시간 투표': 'Live poll',
  '현장에서 진행되는 즉석 투표입니다. 결과가 실시간으로 반영되어 나타납니다.':
    'An on-the-spot poll. Results come in live as people vote.',

  '방문 스탬프': 'Visit stamps',
  '현장 암호를 통해 스탬프를 모으고, 완성 시 선물로 교환할 수 있습니다.':
    'Collect stamps with on-site codes and exchange a full card for a gift.',
  '체험 암호는 칸 순서대로 1111 · 2222 · 3333 · 4444 · 5555 · 6666 입니다.':
    'The demo codes, in slot order, are 1111 · 2222 · 3333 · 4444 · 5555 · 6666.',

  '최애 모의고사': 'Superfan quiz',
  '퀴즈를 풀고 점수에 따른 특별한 칭호를 획득합니다.':
    'Take the quiz and earn a title based on your score.',

  // ── 미리보기 기기 ─────────────────────────────────
  '방문자 폰': 'Visitor phone',
  '스태프 기기': 'Staff device',
  '스태프 기기 (판매)': 'Staff device (for sale)',
  '벽 스크린': 'Wall screen',
  '나무 스크린': 'Tree screen',
  '상영 화면': 'Screening view',

  // ── 진행 순서 ─────────────────────────────────────
  '서비스 고르기': 'Choose a service',
  '보통 24시간 내 답변': 'Usually answered within 24 hours',
  '10가지 서비스 중 이번 행사에 필요한 것을 선택합니다. 방문자용 스마트폰만 사용할지, 현장 스크린이나 스태프 기기를 병행할지 함께 결정합니다.':
    'Pick what this event needs from the ten services. We decide together whether visitor phones are enough, or whether a venue screen and staff devices should run alongside.',

  '제작 · 검수': 'Build and review',
  '수정은 최대 두 번까지': 'Up to two rounds of changes',
  '행사의 컨셉에 맞춰 페이지를 제작합니다. 시안을 미리 보내 드리는 방식이 아니라, 검수일에 완성된 사이트를 직접 전달해 드립니다. 확인하신 후 수정 사항을 말씀해 주시면 꼼꼼히 반영하며, 수정할 시간이 남도록 검수일은 행사일보다 여유 있게 잡아 주시는 편을 권해 드립니다.':
    'I build the page around your event concept. Rather than sending mockups in advance, I hand over the finished site on the review date. Tell me what to change and I will work through it carefully — so please set the review date comfortably before the event, leaving room for those changes.',

  'QR 인쇄': 'Print the QR code',
  '직접 다운로드 후 인쇄': 'Download and print it yourself',
  '전달해 드리는 관리자 화면에서 고해상도 QR 코드를 다운로드하실 수 있습니다. 이를 포스터나 테이블 배너 등에 자유롭게 배치하여 인쇄하시면 됩니다.':
    'You can download a high-resolution QR code from the admin screen I hand over, then place it on posters, table banners or anything else and print it.',

  '현장 운영': 'Run the event',
  '스태프 기기는 전날 준비': 'Set up staff devices the day before',
  '준비된 페이지를 현장에서 바로 사용하시면 됩니다. 스태프가 쓰는 화면은 전날 미리 열어 "홈 화면에 추가"로 앱처럼 띄우고 로그인까지 해 두시면 당일이 수월합니다. 운영 중 예기치 못한 문제가 발생하면 빠르게 해결해 드립니다.':
    'Use the page as it is on the day. For the screens staff use, open them the night before, add them to the home screen so they behave like an app, and sign in — the day itself goes much smoother. If anything unexpected comes up while you are running, I will fix it quickly.',

  // ── 누가 무엇을 하나 ──────────────────────────────
  '제가 해드리는 일': 'What I do',
  '행사에 맞는 서비스 세팅, 맞춤형 페이지 디자인, 전용 웹 주소 및 관리자 계정 발급, 그리고 행사 중 발생하는 기술적 문제에 최대한 빠르게 대응하는 일입니다.':
    'Setting up the service for your event, designing the page to match it, issuing your own web address and admin account, and responding as fast as I can to anything technical that comes up during the event.',
  '주최자께서 준비해 주실 일': 'What you prepare',
  '페이지에 들어갈 텍스트(문항, 카드 내용 등) 작성, 디자인에 활용될 원본 로고 및 배경 이미지 제공, 경품 준비 및 재고 관리, 그리고 현장에서의 암호 안내와 실제 뽑기 진행입니다.':
    'Writing the text that goes on the page (questions, card copy and so on), providing the original logo and background images used in the design, preparing prizes and tracking stock, and handling the on-site codes and the draws themselves.',
  '웹페이지의 전체적인 디자인과 레이아웃은 제가 구성하지만, 베이스가 되는 로고와 배경 이미지 원본은 주최자께서 직접 제공해 주셔야 합니다.':
    'I compose the overall design and layout of the page, but the original logo and background images it is built on have to come from you.',

  // ── 자주 묻는 것 ──────────────────────────────────
  '문의는 어떻게 하나요?': 'How do I get in touch?',
  "카카오톡 오픈채팅을 통해 문의를 받고 있습니다. '문의하기'를 누르시면 선택하신 서비스에 맞는 맞춤형 양식이 생성됩니다. 해당 양식을 복사하여 채팅방에 남겨주시면, 확인 후 정확한 견적과 일정을 안내해 드립니다.":
    "Enquiries come through KakaoTalk Open Chat. Press 'Send an enquiry' and a form tailored to the services you picked is generated. Copy it into the chat room and I will come back with an exact quote and schedule.",

  '비용은 어떻게 되나요?': 'What does it cost?',
  '선택하신 서비스 종류와 운영 기간에 따라 정해진 기준 단가가 있습니다. 문의해 주시면 상세히 안내해 드립니다.':
    'There is a set rate depending on which services you choose and how long they run. Get in touch and I will walk you through it.',

  '별도의 앱을 설치해야 하나요?': 'Does anyone need to install an app?',
  '카페를 방문하신 팬분들은 설치가 전혀 필요 없습니다. QR 코드를 스캔하면 기본 브라우저에서 바로 열립니다. 다만 스태프만 사용하는 화면(럭키드로우 뽑기, 포토카드 증정·판매, 스탬프 수령 확인 등)은 행사 전날 미리 열어 브라우저의 "홈 화면에 추가"로 앱처럼 띄워 두시길 권해 드립니다. 주소창 없이 바로 열려 현장에서 주소를 찾을 일이 없고, 로그인도 미리 해 둘 수 있습니다.':
    'Fans visiting the cafe install nothing — scanning the QR code opens it straight in their browser. For the screens only staff use (the lucky draw, photocard gifting and sales, stamp check-in), I do recommend opening them the night before and adding them to the home screen so they behave like an app. They open without an address bar, so nobody hunts for a link at the venue, and you can sign in ahead of time.',

  '행사 기간이 끝나면 페이지는 어떻게 되나요?': 'What happens to the page when the event ends?',
  '접속 주소가 닫히며 페이지를 더 이상 찾을 수 없게 됩니다. 단, 럭키드로우처럼 행사 종료 후 확인이 필요한 데이터가 있는 서비스는 종료일 기준 14일 동안 다운로드하실 수 있으며, 그 이후에는 안전하게 영구 삭제됩니다.':
    'The address closes and the page can no longer be found. Where a service holds data you may still need afterwards — the lucky draw, for instance — you can download it for 14 days from the end date, after which it is permanently and safely deleted.',

  '방문자가 촬영한 사진은 서버에 저장되나요?': 'Are visitors’ photos stored on a server?',
  '포토존 서비스는 사진 촬영부터 프레임 합성, 기기 저장까지 모두 방문자의 스마트폰 기기 내에서 처리됩니다. 따라서 방문자의 사진은 저희 서버로 전송되거나 저장되지 않습니다.':
    'In the photo zone, everything — taking the photo, applying the frame, saving it — happens on the visitor’s own phone. Their photos are never sent to or stored on our server.',

  '여러 서비스를 동시에 사용할 수 있나요?': 'Can I run several services at once?',
  '하나의 웹 주소에는 하나의 서비스만 배정됩니다. 여러 서비스가 필요하신 경우 주소를 여러 개 생성하여 하나의 행사로 묶어드리며, QR 코드 역시 서비스 개수만큼 발급됩니다.':
    'One web address carries one service. If you need several, I create several addresses and group them as a single event, and you get a QR code for each.',

  '체험용 페이지에서 입력한 데이터는 어떻게 되나요?': 'What happens to what I type on the demo pages?',
  '체험 주소는 기능 확인을 위한 샘플 전용 페이지입니다. 쪽지나 투표 등 다른 사람에게 보일 수 있는 기능들도 실제 서버에 기록이 남지 않도록 차단해 두었으니 안심하고 테스트해 보셔도 됩니다.':
    'The demo addresses are sample pages for trying features out. Anything others could see — notes, votes and so on — is blocked from being recorded on the real server, so test away.',

  // ── 화면 문구 (제목 · 본문 · 링크 낀 문장) ────────
  '생일카페 웹페이지 제작 커미션':
    'Birthday-cafe web page commissions',
  '생일카페를 더 특별하게 만들어 줄|단 하나의 웹페이지를 제작합니다':
    'One web page,|made to keep your birthday cafe special',
  '카페에 방문한 팬들이 QR 코드만 찍으면 스마트폰에서 바로 열리는 전용 웹페이지입니다. 번거로운 앱 설치 없이, {link} 대기 줄에서도 30초면 참여할 수 있도록 직관적으로 설계되며, 행사 기간이 끝나면 페이지는 안전하게 닫힙니다.':
    'Fans at the cafe scan a QR code and the page opens straight on their phone. No app to install — {link} It is designed so anyone can take part in 30 seconds, even standing in the queue, and the page closes safely once the event is over.',
  '웹 페이지 하나가 곧 하나의 특별한 이벤트가 됩니다.':
    'one web page becomes an event in itself.',
  '행사의 컨셉과 분위기에 맞춰 맞춤형으로 페이지를 디자인한 후, 전용 웹 페이지와 관리자 계정을 함께 전달해 드립니다. 생일카페 주최가 처음이신 분들도 쉽게 운영하실 수 있도록 꼼꼼하게 안내해 드립니다.':
    'I design the page around your event’s concept and mood, then hand over the page and an admin account together. If this is your first time hosting a birthday cafe, I will walk you through running it.',
  '1인 체제로 운영되어 한 번에 많은 의뢰를 받지는 못합니다. 하지만 행사 기간 동안 문제가 생기거나 확인이 필요할 때 최대한 빠르게 대응해 드립니다. 궁금한 점이 있으시다면 언제든 {link}를 통해 편하게 말씀해 주세요.':
    'I work alone, so I cannot take many commissions at once. But if something goes wrong or needs checking during your event, I respond as fast as I can. If anything is unclear, please just say so through {link}.',
  '문의':
    'Enquiries',
  '문의하기':
    'Send an enquiry',
  '만들 수 있는 것':
    'What I can build',
  '목록에 없는 새로운 이벤트를 구상하고 계신가요? 원하시는 진행 방식을 {link} 제작 가능 여부를 친절히 안내해 드립니다.':
    'Planning something that is not on the list? {link} and I will let you know whether it can be built.',
  '적어 보내 주시면':
    'write to me about it',
  '여기서 바로 눌러 보기':
    'Try it right here',
  '{link}{josa} 직접 눌러 보세요.':
    'Go ahead and try {link}.',
  '영상 자리':
    'Video goes here',
  '체험용이므로 입력하신 내용은 저장되지 않습니다.':
    'This is a demo, so nothing you type is saved.',
  '화면이 작아 불편하시다면 새 탭에서 직접 열어 보시길 추천합니다 —':
    'If the frame feels small, I recommend opening it in a new tab —',
  '화면이 작아 불편하시다면 {link}을 추천합니다.':
    'If the frame feels small, I recommend {link}.',
  '직접 열어 보시는 편':
    'opening it directly',
  '어떻게 진행되나':
    'How it works',
  '누가 무엇을 하나':
    'Who does what',
  '자주 묻는 것':
    'Common questions',
  '카카오톡 오픈채팅으로 문의를 받고 있습니다. 아래 버튼을 누르시면 원하시는 서비스를 선택할 수 있는 창이 열리며, 선택에 맞춰 문의 양식이 자동 생성됩니다. 생성된 양식을 복사하여 채팅방에 남겨주시면 금액과 일정을 안내해 드립니다.':
    'Enquiries come through KakaoTalk Open Chat. Press the button below and a window opens where you pick the services you want; a form is generated to match. Copy it into the chat room and I will come back with pricing and a schedule.',
  '현재 10가지의 이벤트 페이지가 준비되어 있습니다. 항목을 누르시면 아래 목업 화면에서 페이지가 바로 실행됩니다. 체험용이므로 마음껏 눌러보셔도 서버에 기록이 남지 않으니 안심하셔도 됩니다.':
    'Ten event pages are ready to try. Tap one and it runs right away in the mock-up below. These are demos, so press whatever you like — nothing is recorded on the server.',
}
