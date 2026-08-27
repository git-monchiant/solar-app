-- FAQ ของลูกค้า O&M — เนื้อหาแก้ได้จากหลังบ้าน แสดงในหน้า LIFF /om/liff/faq
-- เป็นตัวตั้งค่าตัวแรกของ "LIFF settings" (แอปอื่นจะทยอยมีของตัวเองตอนสร้างหน้านั้น)

CREATE TABLE dbo.om_faq (
  id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_om_faq PRIMARY KEY,
  category    NVARCHAR(60)  NULL,          -- หมวด เช่น ล้างแผง / ประกัน / การจอง (ว่าง = ไม่จัดหมวด)
  question    NVARCHAR(300) NOT NULL,
  answer      NVARCHAR(MAX) NOT NULL,
  sort_order  INT           NOT NULL CONSTRAINT DF_om_faq_sort DEFAULT 0,
  is_active   BIT           NOT NULL CONSTRAINT DF_om_faq_act  DEFAULT 1,
  view_count  INT           NOT NULL CONSTRAINT DF_om_faq_view DEFAULT 0,  -- นับว่าข้อไหนถูกกดดูบ่อย
  updated_by  INT NULL,
  updated_at  DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_faq_upd DEFAULT SYSDATETIMEOFFSET(),
  created_at  DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_faq_created DEFAULT SYSDATETIMEOFFSET()
);
GO
CREATE INDEX IX_om_faq_active_sort ON dbo.om_faq (is_active, sort_order, id);
GO
-- ตั้งต้นจากคำถามที่ลูกค้าถามจริงบ่อย (แอดมินแก้/เพิ่มได้เอง)
INSERT INTO dbo.om_faq (category, question, answer, sort_order) VALUES
 (N'ล้างแผง', N'สิทธิ์ล้างแผงของฉันเหลือกี่ครั้ง', N'ดูได้ที่เมนู "MyHome" ในแชตนี้ — จะแสดงสิทธิ์คงเหลือของบ้านแต่ละหลัง สิทธิ์ยกยอดได้ ไม่หมดอายุ', 10),
 (N'ล้างแผง', N'ควรล้างแผงบ่อยแค่ไหน', N'แนะนำปีละ 2 ครั้ง โดยเฉพาะช่วงหลังหน้าฝนและช่วงฝุ่นเยอะ แผงที่สกปรกทำให้ผลิตไฟลดลงได้ถึง 20%', 20),
 (N'ล้างแผง', N'ล้างแผงเองได้ไหม', N'ไม่แนะนำ เพราะเสี่ยงต่อการตกจากหลังคาและอาจทำให้แผงเสียหายจนหลุดประกัน ควรให้ทีมช่างที่มีอุปกรณ์ล้างด้วยน้ำ DI', 30),
 (N'ประกัน', N'ประกันของฉันครอบคลุมอะไรบ้าง', N'มี 3 รายการ: ประกันติดตั้ง 2 ปี · ประกันอินเวอร์เตอร์ 5 ปี · ประกันแผง 10 ปี นับจากวันเริ่มประกัน ดูวันหมดของแต่ละรายการได้ที่เมนู "MyHome"', 40),
 (N'ประกัน', N'วันเริ่มประกันนับจากวันไหน', N'นับจากวันติดตั้งหรือวันโอนบ้าน แล้วแต่ว่าวันไหนมาทีหลัง', 50),
 (N'การจอง', N'จองนัดล้างแผงอย่างไร', N'กดเมนู "แจ้งซ่อม / นัดบริการ" เลือกวันและช่วงเวลาที่สะดวก ระบบจะตัดสิทธิ์เมื่อทีมช่างเข้าปฏิบัติงานเสร็จ', 60),
 (N'การจอง', N'เลื่อนหรือยกเลิกนัดได้ไหม', N'ได้ โดยแจ้งล่วงหน้าอย่างน้อย 1 วันทำการ ผ่านเมนูนัดของฉันหรือแชตกับเจ้าหน้าที่', 70),
 (N'ทั่วไป', N'ไฟฟ้าที่ผลิตได้ลดลง ทำอย่างไร', N'ตรวจสอบก่อนว่าแผงสกปรกหรือมีเงาบังหรือไม่ หากล้างแล้วยังผลิตได้น้อยผิดปกติ แจ้งเจ้าหน้าที่เพื่อนัดตรวจระบบ', 80);
GO
