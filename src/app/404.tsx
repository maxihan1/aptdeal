export default function NotFound() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>페이지를 찾을 수 없습니다.</h1>
      <p style={{ color: '#888' }}>요청하신 페이지가 존재하지 않거나, 이동되었을 수 있습니다.</p>
    </div>
  );
} 