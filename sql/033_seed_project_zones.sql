-- Backfill district/province from project names (Thai geography knowledge)
USE solardb;
GO

-- รังสิต - คลอง 1 = ลำลูกกา/ธัญบุรี, ปทุมธานี
UPDATE projects SET district = N'อำเภอธัญบุรี', province = N'จังหวัดปทุมธานี'
WHERE name LIKE N'%รังสิต%คลอง 1%' AND district IS NULL;
GO

-- บางบัวทอง = นนทบุรี
UPDATE projects SET district = N'อำเภอบางบัวทอง', province = N'จังหวัดนนทบุรี'
WHERE name LIKE N'%บางบัวทอง%' AND district IS NULL;
GO

-- รัตนาธิเบศร์ = เมืองนนทบุรี
UPDATE projects SET district = N'อำเภอเมืองนนทบุรี', province = N'จังหวัดนนทบุรี'
WHERE name LIKE N'%รัตนาธิเบศร์%' AND district IS NULL;
GO

-- แพรกษา = สมุทรปราการ
UPDATE projects SET district = N'อำเภอเมืองสมุทรปราการ', province = N'จังหวัดสมุทรปราการ'
WHERE name LIKE N'%แพรกษา%' AND district IS NULL;
GO

-- สุขุมวิท (without แพรกษา) = assume สมุทรปราการ area
UPDATE projects SET district = N'อำเภอเมืองสมุทรปราการ', province = N'จังหวัดสมุทรปราการ'
WHERE name LIKE N'%สุขุมวิท%' AND district IS NULL;
GO

-- J City เสนา / J Villa เสนา = อยุธยา (เสนา = อำเภอเสนา)
UPDATE projects SET district = N'อำเภอเสนา', province = N'จังหวัดพระนครศรีอยุธยา'
WHERE (name LIKE N'J City เสนา' OR name LIKE N'J Villa เสนา%') AND district IS NULL;
GO

-- จังหิล = คลอง 1 area = ปทุมธานี
UPDATE projects SET district = N'อำเภอธัญบุรี', province = N'จังหวัดปทุมธานี'
WHERE name LIKE N'%จังหิล%' AND district IS NULL;
GO

-- กม.9 = คันนายาว กรุงเทพ (already has district, fill province)
UPDATE projects SET province = N'กรุงเทพมหานคร'
WHERE name LIKE N'%กม.9%' AND province IS NULL;
GO

-- Exclusive วิลล์ = assume ปทุมธานี (SENA project)
UPDATE projects SET district = N'อำเภอลำลูกกา', province = N'จังหวัดปทุมธานี'
WHERE name = N'Exclusive วิลล์' AND district IS NULL;
GO
