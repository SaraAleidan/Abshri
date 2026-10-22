// أبشري — إعداد التخزين المشترك (اختياري)
// اتركي القيمتين فارغتين: الموقع يعمل بالكامل ويحفظ الشكاوى في متصفح كل زائرة.
// لتفعيل قاعدة بيانات مشتركة: أنشئي مشروع Supabase مجانياً، نفّذي supabase/schema.sql،
// ثم ضعي هنا "Project URL" و "anon public key" من Project Settings → API.
// مفتاح anon مصمّم ليكون علنياً؛ الحماية تأتي من سياسات RLS في schema.sql.
// لا تضعي أبداً مفتاح service_role هنا.
window.ABSHRI_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: ""
};
