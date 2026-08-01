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

  // ── 문의 창 (양식 본문은 한국어로 둔다 — 머리말 참조) ──
  '닫기':
    'Close',
  '카카오톡 오픈채팅으로 문의를 받고 있습니다':
    'Enquiries come through KakaoTalk Open Chat',
  '오픈채팅방 닉네임을 [{rule}] 형식으로 설정해 주세요. (예: {example})':
    'Set your Open Chat nickname in the form [{rule}] — event dates / the name being celebrated. Keep it in Korean so it reads in the chat room. (e.g. {example})',
  '원하시는 서비스(또는 주문 제작)를 선택하신 후, 하단의 양식을 복사해 주세요.':
    'Pick the services you want (or a custom build), then copy the form below.',
  '복사한 양식을 채팅방에 붙여넣고 내용을 채워 보내주시면, 일정과 견적을 안내해 드립니다.':
    'Paste the form into the chat room, fill it in and send it, and I will come back with a schedule and a quote.',
  '긴급 작업 여부는 [자료 전달 예정일]과 [시연/검수 희망일] 사이의 기간을 기준으로 산정됩니다.':
    'Whether the job counts as rush work is judged by the gap between [when you send materials] and [your preferred review date].',
  '검수일에 완성된 사이트를 전달해 드립니다. 그날 처음 보시고 수정 사항을 말씀해 주시는 흐름이라, 고칠 시간이 남도록 검수일은 행사일보다 여유 있게 잡아 주시는 편을 권해 드립니다.':
    'I hand over the finished site on the review date. You see it for the first time that day and tell me what to change, so please set the review date comfortably before the event, leaving room for those changes.',
  '양식은 한국어로 만들어져요 — 채우지 않고 그대로 보내주셔도 괜찮습니다.':
    'The form itself is generated in Korean — sending it as is, unfilled, is fine too.',
  '문의할 서비스':
    'Services to ask about',
  '중복 선택이 가능합니다':
    'you can pick more than one',
  '보낼 양식':
    'The form to send',
  '{n}개 항목':
    '{n} items',
  '아직 구체적으로 정하지 못하셨어도 괜찮습니다.':
    'It is fine if you have not settled on the details yet.',
  '양식 복사하기':
    'Copy the form',
  '복사되었습니다':
    'Copied',
  '오픈채팅 열기':
    'Open the chat',
  '복사하신 양식을 채팅방에 그대로 붙여넣어 주시면 됩니다.':
    'Just paste the copied form into the chat room as it is.',

  // ── 조각을 통문장으로 바꾼 자리 ────────────────────
  '실제로 구동되는 페이지입니다. 현재 선택하신':
    'These are live pages. Go ahead and try the',
  '서비스 미정': 'Service undecided',
  '1) 일정': '1) Schedule',
  '희망 운영일 (행사기간, 마지막 날짜 기입 필수):': 'Event dates (please include the last day):',
  '자료 전달 예정일:': 'When you will send us materials:',
  '시연/검수 희망일:': 'Preferred demo / review date:',
  '※ 긴급 여부(일반 / 10일 이내 / 3일 이내)는 자료 전달 예정일과': '* Urgency (normal / within 10 days / within 3 days) is calculated from the gap',
  '　시연/검수 희망일 사이 기간으로 계산됩니다.': '　between those two dates.',
  '※ 검수일에 완성된 사이트를 전달해 드립니다. 그날 처음 보시고 수정 사항을': '* We hand over the finished site on the review date. You see it for the first time',
  '　말씀해 주시는 흐름이라, 고칠 시간이 남도록 검수일은 행사일보다': '　that day and tell us what to change, so please leave room between the review',
  '　여유 있게 잡아 주시는 편을 권해 드립니다.': '　date and the event date.',
  '2) 관리자 로그인 정보': '2) Admin login',
  '관리자 이메일:': 'Admin email:',
  '관리자 비밀번호:': 'Admin password:',
  '3) 디자인 (공통)': '3) Design (shared)',
  '행사명:': 'Event name:',
  '디자인 요소(로고, 포인트 컬러, 버튼 스타일 등):': 'Design elements (logo, accent colour, button style, etc.):',
  '배경 이미지/파일(있다면 오픈채팅으로 전달):': 'Background image/file (send via open chat if you have one):',
  '4) 서비스별 설정': '4) Per-service settings',
  '쓰고 싶은 서비스 (아직 못 정하셨다면 하시려는 이벤트를 적어 주세요):': 'Services you want (if undecided, describe the event you have in mind):',
  '5) 기타': '5) Anything else',
  '추가 요청 사항:': 'Additional requests:',
  '뽑는 장수 (1장 / 3장):': 'Cards drawn (1 / 3):',
  '카드 앞면 (기본 제공 78장 / 직접 제작):': 'Card fronts (our 78 / your own):',
  '카드 뒷면 이미지:': 'Card back image:',
  '질문 타로 사용 여부:': 'Use question tarot:',
  'AI 종합 리딩 사용 여부 (3장 뽑기에만 붙습니다):': 'Use AI summary reading (3-card draws only):',
  '※ 질문과 답변은 운영 전 관리자 페이지에서 직접 입력해 주시면 됩니다.': '* You enter questions and answers yourself on the admin page before the event.',
  '사용할 기기 (예: 아이패드 에어, 아이패드 미니 등):': 'Device you will use (e.g. iPad Air, iPad mini):',
  '뽑기 버튼 문구 (기본 DRAW):': 'Draw button text (default DRAW):',
  '배송이 필요한 경품 유무 (있으면 당첨자 배송 정보 입력 화면이 붙습니다):': 'Any prizes that need shipping (if so, winners get a shipping form):',
  '※ 물품 및 수량은 운영 전 관리자 페이지에서 직접 입력해 주시면 됩니다.': '* You enter items and quantities yourself on the admin page before the event.',
  '　(물품 최대 100개, 수량 제한 없음, 임의 확률 조정 불가)': '　(up to 100 items, no quantity limit, odds cannot be hand-tuned)',
  '운영 방식 (저장용 / 1장 증정 / 판매 N연차):': 'Mode (save-only / one free card / N-pull sale):',
  '사용할 기기 (증정·판매는 스태프 기기에서 뽑습니다):': 'Device (gift and sale modes draw on the staff device):',
  '실물 카드 교환 여부:': 'Exchange for physical cards:',
  '※ 카드 이미지·이름·레어도·재고는 관리자 페이지에서 직접 등록해 주시면 됩니다.': '* You register card images, names, rarity and stock yourself on the admin page.',
  '※ 저장용은 방문자 폰에서 뽑고 이미지 저장까지 됩니다.': '* In save-only mode visitors draw on their own phone and can save the image.',
  '벽(스크린) 사용 여부와 기기:': 'Wall (screen) use and device:',
  '쪽지 색·글씨체 희망:': 'Preferred note colours and handwriting:',
  '스티커 이미지 (있다면 오픈채팅으로 전달):': 'Sticker images (send via open chat if you have any):',
  '공개 전 검수 여부 (켜면 승인한 쪽지만 벽에 붙습니다):': 'Review before publishing (only approved notes go on the wall):',
  '나무·밤하늘 배경 이미지:': 'Tree and night-sky background images:',
  '등불 색 희망:': 'Preferred lantern colours:',
  '매다는 장식 이미지 (있다면 오픈채팅으로 전달):': 'Hanging ornament images (send via open chat if you have any):',
  '공개 전 검수 여부:': 'Review before publishing:',
  '스크린 사용 여부와 기기:': 'Screen use and device:',
  '프레임 PNG (투명 배경, 여러 장 가능 — 오픈채팅으로 전달):': 'Frame PNGs (transparent background, multiple allowed — send via open chat):',
  '촬영 방식 (카메라 / 사진 올리기 / 둘 다):': 'Capture mode (camera / upload / both):',
  '기본 카메라 (전면 / 후면):': 'Default camera (front / rear):',
  '결과물에 넣을 워터마크 문구:': 'Watermark text on the result:',
  '※ 방문자 사진은 폰 안에서 합성되고 서버에 올라가지 않습니다.': '* Visitor photos are composed on the phone and never uploaded to a server.',
  '상영 화면 비율 (16:9 / 4:3):': 'Screening aspect ratio (16:9 / 4:3):',
  '한 화면에 띄울 말풍선 수 (1~10, 6~8개 권장):': 'Bubbles on screen at once (1-10, 6-8 recommended):',
  '교체 간격 (3~15초):': 'Rotation interval (3-15 s):',
  '이름 표시 여부 / 1인 입력 수 / 글자 수:': 'Show names / entries per person / character limit:',
  '엔딩크레딧 사용 여부:': 'Use ending credits:',
  '상영 장비 (OBS·프리즘 등 브라우저 소스를 쓸 수 있는지):': 'Screening setup (can it use a browser source, e.g. OBS / PRISM):',
  '결과 공개 방식 (실시간 / 투표 후 / 마감 후):': 'When results appear (live / after voting / after close):',
  '득표 수 표시 여부:': 'Show vote counts:',
  '결과 모양 (막대 / 하트):': 'Result style (bar / heart):',
  '현황 화면(스크린) 사용 여부와 기기:': 'Live board (screen) use and device:',
  '※ 문항과 보기는 운영 전 관리자 페이지에서 직접 등록해 주시면 됩니다.': '* You register questions and options yourself on the admin page before the event.',
  '도장 칸 수와 각 칸 이름:': 'Number of stamp slots and their names:',
  '도장·판 배경 이미지:': 'Stamp and board background images:',
  '선물 (없음 / 확정 지급 / 응모):': 'Gift (none / guaranteed / raffle):',
  '하루마다 초기화 여부:': 'Reset daily:',
  '현장 암호 자릿수 (기본 4자리):': 'On-site code length (default 4):',
  '교환 확인에 쓸 스태프 기기 (확정 선물일 때):': 'Staff device for redemption (for guaranteed gifts):',
  '※ 암호는 관리자 페이지에서 보고 언제든 새로 만들 수 있습니다.': '* You can view and regenerate the codes any time on the admin page.',
  '문항 수와 유형 (객관식 / 주관식):': 'Number and type of questions (multiple choice / short answer):',
  '점수 구간별 칭호:': 'Titles by score range:',
  '선물 (없음 / 커트라인 확정 / 응모):': 'Gift (none / above cutoff / raffle):',
  '정답 공개 (공개 안 함 / 제출 후 전체 / 틀린 것만):': 'Show answers (never / all after submit / wrong ones only):',
  '제한 시간:': 'Time limit:',
  '※ 문항과 정답은 관리자 페이지에서 직접 등록해 주시면 됩니다.': '* You register questions and answers yourself on the admin page.',
  '　(정답은 방문자 화면에 내려가지 않습니다)': '　(answers are never sent to the visitor screen)',
  '만들고 싶은 것 (어떤 이벤트에서 어떻게 쓰나요):': 'What you want built (what event, used how):',
  '조작하는 사람 (방문자 폰 / 스태프 기기 / 스크린 — 여럿이면 다 적어 주세요):': 'Who operates it (visitor phone / staff device / screen — list all):',
  '화면 흐름 (방문자가 무엇을 하면 무엇이 보이나요):': 'Screen flow (visitor does what, sees what):',
  '비슷하다고 생각한 서비스나 사례:': 'Similar services or examples you have in mind:',
  '이미 준비된 자료 (이미지·문구·명단 등):': 'Material you already have (images, text, lists):',
  '주문 제작': 'Custom build',
  '행사기간 / 주인공 이름': 'event dates / celebrant name',
  '8/12~8/14 / 리안': '8/12-8/14 / Rian',
}
