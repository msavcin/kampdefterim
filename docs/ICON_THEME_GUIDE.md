**Kamp Defterim — İkon ve Tema Rehberi**

Kısa not: Bu doküman yeni merkezi ikon ve tema altyapısının nasıl kullanılacağını açıklar.

- **Tema sağlayıcı**: [components/ThemeProvider.tsx](components/ThemeProvider.tsx)
  - Uygulamayı sistem renk düzenine göre (light/dark) sarar.
  - `useTheme()` hook'u ile `theme.colors` üzerinden renkleri alabilirsiniz.

- **Merkezi ikon bileşeni**: [app/icons/index.tsx](app/icons/index.tsx)
  - Tek noktadan ikon çağırmak için: `<Icon name="Plus" size={20} color="#059669" />`.
  - `Icon` önce `lucide-react-native` içindeki ikonları deniyor; bulamazsa `app/icons/svgIcons.ts` içindeki SVG string'lerine bakıyor; en son `app/icons/weatherSvgs.ts` içinden hava ikonlarını çağırıyor.
  - Kategoriler `ICON_CATEGORIES` içerisinde listelenmiştir.

- **Hava ikonları**: [app/icons/weatherSvgs.ts](app/icons/weatherSvgs.ts)
  - Basit, ücretsiz SVG sprite'ları içerir. İhtiyaç halinde genişletin veya daha kaliteli set ile değiştirin.

- **Bileşenler**
  - `components/ThemedButton.tsx`: Varyantlı düğmeler (`primary`, `secondary`, `ghost`, `danger`). Tema uyumlu.
  - `components/Badge.tsx`: Künye / etiket bileşeni, tema uyumlu.
  - `components/WeatherIcon.tsx`: Hava açıklamasına göre uygun SVG'yi render eder.

- **Kademeli geçiş**
  - Mevcut sayfalarda doğrudan `lucide-react-native` kullanan import'lar bulunuyor. Bunları yavaşça `Icon` wrapper'ına çevirmek yeterli.
  - Stil geçişleri için, komponent içinde `useTheme()` ile `theme.colors` alınarak `styles` üzerine merge yapılmıştır (`camp-plan.tsx` örneği).

Örnek kullanım (sayfa içinde):

```tsx
import Icon from './icons';
import { useTheme } from '../components/ThemeProvider';

const { theme } = useTheme();
<Icon name="MapPin" size={18} color={theme.colors.primary} />
```

İleride: `app/icons` altında kategorilere göre alt dosyalar (ui, map, weather, badges) oluşturup, ikonlar ve SVG setlerini daha da organize edebiliriz.
