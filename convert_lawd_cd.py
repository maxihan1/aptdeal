import json

input_path = 'web/LAWD_CD.txt'  # 공백 없는 경로로 수정
output_path = 'web/lawd_cd_map.json'

lawd_map = {}

with open(input_path, encoding='utf-8') as f:
    for i, line in enumerate(f):
        if i == 0:
            continue  # 헤더 스킵
        parts = line.strip().split('\t')
        if len(parts) < 3:
            continue
        code, name, status = parts[:3]
        if status != '존재':
            continue
        # 시군구 단위: 법정동코드 10자리 중 뒤 5자리가 모두 0
        if code.endswith('00000'):
            lawd_cd = code[:5]
            lawd_map[name] = lawd_cd

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(lawd_map, f, ensure_ascii=False, indent=2)

print(f"생성 완료: {output_path} (총 {len(lawd_map)}건)") 