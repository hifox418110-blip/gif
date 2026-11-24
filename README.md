# Framelab — 스마트 GIF 생성기와 편집기

## 실행
ZIP 전체를 먼저 압축 해제한 뒤 index.html을 Chrome 또는 Edge에서 엽니다. 설치, 빌드, API 키, 외부 CDN이 필요 없습니다. 예제 GIF 버튼 또는 examples/wave.gif로 바로 시작할 수 있습니다.

## 사진으로 만들기
GIF 생성 탭에서 JPG, PNG, WEBP 사진을 선택합니다. 사진 순서를 조정하고 프레임 표시 시간을 설정한 다음 GIF 만들기를 누릅니다. 첫 사진의 비율을 사용하며 비율이 다른 사진은 흰 여백을 둡니다. 생성한 파일은 바로 다운로드하거나 편집기로 이어갈 수 있습니다.

## 편집
편집 탭에서 GIF 한 개를 선택하거나 드래그합니다. 왼쪽에 원본, 오른쪽에 도구가 표시됩니다. Go!로 적용한 뒤 다른 GIF 편집을 선택하면 적용한 결과를 이어서 처리합니다. 원본은 접힌 패널로 남습니다. 새 작업으로 시작 상태로 돌아갑니다.

- Resize: 현재 이미지의 5~300% 범위에서 가로·세로 크기를 조절합니다. 픽셀 단위로 반올림하고 최솟값은 1입니다. 자물쇠로 비율 고정을 전환합니다.
- Crop: 원하는 비율로 중앙을 확대하거나 원본 전체와 단색 여백을 사용합니다.
- Downsizing: 크기 축소, 프레임 건너뛰기, 내부 해상도 축소를 조합합니다. 건너뛴 프레임의 시간은 직전 프레임에 더합니다.
- Format Convert: 원하는 한 프레임을 JPG로, 전체 애니메이션을 MP4(H.264)로 출력합니다. 홀수 길이의 영상 가장자리는 짝수 픽셀로 채웁니다.
- Rotate: 90°, 180°, 270° 회전 및 좌우·상하 반전.
- Optimize: 재생 결과를 보존하는 방식으로 압축을 시도하고 더 작은 파일을 선택합니다.
- Reverse, Speed, Cut: 역순 재생, 0.25~4배속, 시작·끝 프레임을 포함한 구간 저장.
- 다운로드는 작업 종류와 원본명을 결합한 이름을 씁니다. 다른 이름으로 저장은 원본명_ed와 결과 확장자를 제안합니다. 원본 파일 핸들을 제공하는 브라우저에서 원래 위치를 제안하며, 그 외에는 브라우저의 다운로드 위치 설정을 따릅니다.

- Boomerang: 양 끝을 중복하지 않고 정방향과 역방향을 이어서 반복합니다.

## GitHub Pages 배포
저장소 최상위에 index.html, style.css, app.js, codec.js, vendor, examples를 이 구조 그대로 올립니다. Settings → Pages → Build and deployment에서 Deploy from a branch, main, /(root)를 선택하고 Save합니다. 배포가 완료되면 Pages 화면의 Visit site 주소에서 예제 GIF를 열어 확인합니다.
공식 안내: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 구성
index.html은 화면, style.css는 레이아웃, app.js는 사용자 작업과 프레임 편집, codec.js는 GIF 처리 및 MP4 출력 담당입니다. vendor에는 브라우저용 외부 라이브러리와 라이선스를 포함합니다. omggif 라이선스는 gif-libs.js 머리말에 포함됩니다.
