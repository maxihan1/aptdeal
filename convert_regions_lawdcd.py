import json

# 파일 경로
regions_path = 'web/regions.json'
lawd_map_path = 'web/lawd_cd_map.json'
output_path = 'web/regions_with_lawdcd.json'

# 데이터 로드
with open(regions_path, encoding='utf-8') as f:
    regions = json.load(f)
with open(lawd_map_path, encoding='utf-8') as f:
    lawd_map = json.load(f)

# 변환 결과 구조
result = {
    'sido': regions['sido'],
    'sigungu': {}
}

for sido in regions['sigungu']:
    result['sigungu'][sido] = []
    for sigungu in regions['sigungu'][sido]:
        # 시군구명 조합
        full_name = f"{sido} {sigungu['name']}"
        lawd_cd = lawd_map.get(full_name)
        # 'code' 필드에 lawd_cd 저장, 'name'과 'code'만 남김
        sigungu_new = {
            'name': sigungu['name'],
            'code': lawd_cd if lawd_cd else ''
        }
        result['sigungu'][sido].append(sigungu_new)

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"생성 완료: {output_path}") 