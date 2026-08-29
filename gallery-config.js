// EDYTUJ TEN PLIK DLA KAŻDEJ GALERII.
// WERSJA DEMO: hasło chroni interfejs, ale nie jest zabezpieczeniem plików na poziomie serwera.
// Docelowo zdjęcia i autoryzację podepniemy pod backend/Firebase.

window.GALLERY_CONFIG = {
  id: "demo-001",
  title: "Sesja przykładowa",
  subtitle: "Wybierz ulubione zdjęcia lub pobierz wybrane fotografie.",
  password: "raf123",
  photos: [
    {
      id: "01",
      preview: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=82",
      full: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2400&q=92",
      filename: "RAF_0001.jpg"
    },
    {
      id: "02",
      preview: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=82",
      full: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=2400&q=92",
      filename: "RAF_0002.jpg"
    },
    {
      id: "03",
      preview: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=82",
      full: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=2400&q=92",
      filename: "RAF_0003.jpg"
    },
    {
      id: "04",
      preview: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=82",
      full: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=2400&q=92",
      filename: "RAF_0004.jpg"
    },
    {
      id: "05",
      preview: "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&w=1200&q=82",
      full: "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&w=2400&q=92",
      filename: "RAF_0005.jpg"
    },
    {
      id: "06",
      preview: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=82",
      full: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=2400&q=92",
      filename: "RAF_0006.jpg"
    }
  ]
};
