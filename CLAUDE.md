# React Native Template

Opinionated Expo Router starter scaffolded from Tan's conventions: bilingual EN/AR + RTL, swipeable tabs, TanStack Query, RHF + zod, Zustand+SecureStore. Replace this header with your project name when you fork.

## Tech Stack

- **React Native 0.81.5** / **Expo SDK 54**
- **TypeScript** (strict mode, `@/*` path alias)
- **Expo Router 6** (file-based routing)
- **React Native Reanimated 4** (animations)
- **PagerView** (swipeable tabs)

## Commands

```bash
npx expo start          # Dev server (try Expo Go first)
npx expo start --ios
npx expo start --android
```

**Always try Expo Go before custom builds** (`npx expo run:ios/android`). Native builds only when you add a module that requires them.

## Project Structure

```
app/
├── _layout.tsx          # Root layout: providers (Query, i18n, GH, SafeArea), fonts, splash gating
├── modal.tsx
└── (tabs)/
    ├── _layout.tsx      # Swipeable PagerView + CustomTabBar
    ├── index.tsx        # Home
    ├── search.tsx
    ├── create.tsx
    ├── notifications.tsx
    └── profile.tsx
components/
├── ui/icon.tsx          # Ionicons wrapper — use this for ALL icons
└── tab-bar/custom-tab-bar.tsx
hooks/
├── use-theme-colors.ts  # Reads colorScheme → returns Colors[scheme]
└── ...                  # Add use-debounce, use-keyboard, etc. as needed
constants/
├── Colors.ts            # light/dark themes + brand gold
├── Typography.ts        # Poppins presets
└── Spacing.ts           # xs/sm/md/lg/xl
i18n/
├── index.ts             # i18next + RTL flow + restart on lang change
├── en.json
└── ar.json
lib/
└── restart.ts           # expo-updates reload (DevSettings in dev)
store/
└── tab-store.ts         # Zustand store for active tab index
```

Add `services/` (axios + API), `services/auth.ts`, `store/auth-store.ts`, etc. when you need them — see "Data Layer" and "State Management" below for the patterns.

## Code Conventions

- **kebab-case** for filenames: `auth-wizard.tsx`, `use-favorite.ts`
- Use `@/` path alias (configured in tsconfig)
- **Never co-locate components/utils inside `app/`** — `app/` is for routes only
- **Interfaces over types**, avoid enums (use `as const` maps)
- Functional components, named exports
- TypeScript strict mode

## Styling

- **Inline styles only** — no `StyleSheet.create`
- `borderCurve: 'continuous'` for rounded corners
- `boxShadow` (CSS-style) — not legacy `shadowColor`/`shadowOffset`/`elevation`
- `useWindowDimensions` over `Dimensions.get`
- Prefer flex `gap` over margin/padding between siblings
- Theme colors via `useThemeColors()` — never raw hex in components. If you need a brand color, add it to `constants/Colors.ts` (e.g., `Colors.brand`) and reference that, not the hex.

## Design System

- **Colors** — `constants/Colors.ts` exports `light` / `dark` schemes. Theme-tied props: `text`, `background`, `card`, `border`, `tint`, `tabIconDefault/Selected`, `surface`, `destructive`, `muted`, `subtle`, `onTint`. Defaults are neutral (iOS blue tint) — replace with your brand palette but keep the same field names so consumers don't change.
- **Typography** — `constants/Typography.ts` exports presets: `heading-lg/md/sm`, `body`, `body-md`, `caption`, `caption-sm`, `micro`, `input-label`. Spread into style: `style={{ ...Typography['heading-md'], color: colors.text }}`.
- **Spacing** — `constants/Spacing.ts`: `xs:3, sm:5, md:10, lg:15, xl:20`.
- **Fonts** — Poppins (loaded via `useFonts` from `@expo-google-fonts/poppins` in `app/_layout.tsx`). Variants: 200, 300, 400, 500, 600 (regular + italic).

## Components

- `react-native-safe-area-context` (not RN's SafeAreaView)
- `<ScrollView contentInsetAdjustmentBehavior="automatic" />` instead of wrapping in SafeAreaView
- `process.env.EXPO_OS` not `Platform.OS`
- `<Icon>` from `@/components/ui/icon` for ALL icons (Ionicons-backed; works iOS + Android)
- `expo-image` for actual images only (photos, logos)

## Animations

- **Reanimated only** — never `Animated` from react-native
- `useSharedValue` + `useAnimatedStyle` for animated values
- `withSpring` / `withTiming` for drivers
- `FadeIn` / `FadeOut` for entering/exiting

## Navigation & Tab Bar

- Expo Router file-based routing. Group routes: `(tabs)`, `(auth)`, `(modal-flows)`.
- `<Link href="/path" />` for navigation, `<Stack.Screen options={{ title }} />` for headers, `presentation: 'modal'` for sheets.

### Swipeable Tabs (the pattern)

`app/(tabs)/_layout.tsx` uses **PagerView** instead of Expo Router's `<Tabs>`:

- All tab screens are imported and rendered inside a single `<PagerView>`
- A `Set<number>` tracks which tabs have been visited so we **lazy-render** screens (`{rendered.has(i) && <Screen />}`)
- `pagerRef.current?.setPage(i)` drives swipes from `<CustomTabBar onTabPress>`
- `onPageSelected` syncs `activeIndex` + `useTabStore` + fires `Haptics.impactAsync` on iOS
- `usePathname` syncs deep-link navigation back into the pager
- `layoutDirection={isRTL ? 'rtl' : 'ltr'}` is **required** for PagerView in Arabic — RN's auto-flip doesn't cover it
- `isRTL` is captured at module scope (`const isRTL = I18nManager.isRTL`) — `forceRTL` requires a restart anyway, so the value is stable for the session

`components/tab-bar/custom-tab-bar.tsx` rules:

- `TAB_DEFS` array drives icons; active swap is `${icon}-outline` → filled
- Badges via the optional `badges` prop (e.g., `{ 3: unreadCount }`)
- Badge position is RTL-aware: `...(isRTL ? { left: -6 } : { right: -6 })`
- Respects safe-area inset via `useSafeAreaInsets()`

## State Management

Use **Zustand** with `persist` middleware. Pattern:

- **Sensitive data** (auth token, refresh token): `expo-secure-store` adapter
- **Non-sensitive** (theme, language, UI prefs): `@react-native-async-storage/async-storage`
- Use `partialize` to limit what's persisted
- Use `onRehydrateStorage` → set `hasHydrated` flag, gate splash on it

Read sync from anywhere: `useStore.getState().value`. Subscribe in components: `useStore(s => s.value)`.

When you scaffold an auth store, base it on the Tan pattern at `../store/auth-store.ts` (Tan repo).

## Data Layer (TanStack Query + axios)

QueryClient defaults: `retry: 2`, `staleTime: 5 min`. Defined in `app/_layout.tsx`.

### Query key conventions

Hierarchical arrays. Examples: `['user', userId]`, `['posts']`, `['posts', filter]`, `['comments', postId, page]`.

### Mutation pattern

```ts
const m = useMutation({
  mutationFn: api.toggleFavorite,
  onMutate: async ({ id }) => {
    await queryClient.cancelQueries({ queryKey: ['posts'] })
    queryClient.setQueriesData({ queryKey: ['posts'] }, optimisticUpdate)
  },
  onError: () => queryClient.invalidateQueries({ queryKey: ['posts'] }),
})
```

### Infinite queries

Use `useInfiniteQuery` with `getNextPageParam` + `initialPageParam`. Flatten pages with `useMemo`.

### axios setup (`lib/api.ts` — scaffold when you add a backend)

```ts
export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().user?.token
  if (token) config.headers.Authorization = `Bearer ${token}`
  // FormData uploads: drop Content-Type, extend timeout
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
    config.timeout = 120000
  }
  return config
})

api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401 && e.config?.headers?.Authorization) {
      useAuthStore.getState().clearUser()
    }
    return Promise.reject(e)
  },
)
```

**Never** `fetch` + `useState` for data — always TanStack Query.

## Forms (React Hook Form + zod)

Inline schema per form. `Controller` per field wrapping a custom `<Input>`:

```ts
const schema = z.object({
  phone: z.string().min(7, 'Enter a valid phone number'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})
type FormData = z.infer<typeof schema>

const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: { phone: '', password: '' },
})

const mutation = useMutation({
  mutationFn: authService.login,
  onSuccess: (res) => { /* save session, navigate */ },
  onError: (err) => setToast(err?.response?.data?.message),
})

const onSubmit = (v: FormData) => mutation.mutate(v)
```

Errors render inline below each field, color `colors.destructive`. Use a toast for API errors (localized).

## i18n / RTL

`i18next` + `react-i18next`. Translation files in `i18n/{en,ar}.json`. Init in `i18n/index.ts`.

Read translations: `const { t, i18n } = useTranslation()`; `t('tabs.home')`.

Switch language via the exported `changeLanguage('ar' | 'en')` — saves to AsyncStorage, calls `I18nManager.forceRTL(shouldBeRTL)`, restarts the app via `lib/restart.ts` if RTL flips.

### RTL layout rules

**ALWAYS invoke the `react-native-rtl-positioning` skill when writing or reviewing RTL layout code.** It covers `flexDirection`, `textAlign`, absolute positioning, margins, and icon flipping for apps that use `I18nManager.forceRTL(true)` — exactly this template's setup. Don't reason about RTL from scratch; load the skill.

Project-specific overrides on top of the skill:

- **No `marginStart`/`marginEnd`/`paddingStart`/`paddingEnd`** — use `flexDirection` reversal or a physical-edge ternary. Tan's chosen pattern, kept here for consistency.
- **PagerView** needs explicit `layoutDirection={isRTL ? 'rtl' : 'ltr'}` — RN doesn't auto-flip the gesture direction.
- **Capture `isRTL` at module scope** when you can (`const isRTL = I18nManager.isRTL`) — `forceRTL` requires a restart, so the value is stable for the session.

## Auth Flow

When you add auth:
- Login/signup screens in `app/(auth)/`
- Token stored in Zustand-persisted `user.token` via SecureStore
- Request interceptor reads sync via `useAuthStore.getState()`
- 401 with `Authorization` header set → clear user → router resolves to auth stack
- No refresh token by default — 401 forces re-login

## Push Notifications

When you add them:
- `expo-notifications` for permissions + Expo push token (FCM Android, APNs iOS)
- `setNotificationHandler` for foreground display
- Register token with backend after login: `POST /users/me/device-token`
- Deregister on logout
- Android: define a channel with `Notifications.AndroidImportance.MAX`
- Tap routing: `addNotificationResponseReceivedListener` → switch on `data.type`

## WebSockets

Native `WebSocket` (not socket.io) when you need realtime:
- URL with `?token=...` query param for auth
- 25s ping keep-alive
- Exponential reconnect (1s → 30s)
- Provider+Context pattern; expose imperative methods (`sendMessage`, `markRead`) returning Promises that resolve on server ACK

## UX

- `expo-haptics` conditionally on iOS: `if (process.env.EXPO_OS === 'ios') Haptics.impactAsync(...)`
- `selectable` on `<Text>` showing copyable data (phones, IDs)
- `{ fontVariant: 'tabular-nums' }` for counters
- Format large numbers as `1.4M`, `38k` (write a tiny `lib/format-count.ts`)
- Add entering/exiting animations (`FadeIn`/`FadeOut`) for state changes

## Backend

Set `EXPO_PUBLIC_API_URL` in env (in `.env` and `app.json` extra). Never hardcode.

When you find a backend bug, log it in a project-root `BACKEND_ISSUES.md` instead of working around it in the client.

## Libraries to Install When Needed

| Need | Package |
| --- | --- |
| Forms | `react-hook-form`, `@hookform/resolvers`, `zod` *(already deps)* |
| HTTP / server state | `axios`, `@tanstack/react-query` *(already deps)* |
| Global state | `zustand` *(already dep)* |
| Secure storage | `expo-secure-store` *(already dep)* |
| Image optimization | `expo-image` *(already dep)* |
| Haptics | `expo-haptics` *(already dep)* |
| Push notifications | `expo-notifications` |
| Realtime | (native WebSocket — no lib needed) |
| Camera / pickers | `expo-camera`, `expo-image-picker` |
| Audio / video | `expo-audio`, `expo-video` |
| Linear gradient | `expo-linear-gradient` |

Install with `npx expo install <pkg>` (resolves the version compatible with your SDK).

## Don'ts

- ❌ `Animated` from react-native — use Reanimated
- ❌ `StyleSheet.create` — use inline styles
- ❌ `expo-permissions` (legacy) — use the per-module permission API
- ❌ `expo-av` — use `expo-audio` / `expo-video`
- ❌ `fetch` + `useState` for data — use TanStack Query
- ❌ `div`, `img`, intrinsic HTML — RN doesn't have them
- ❌ `marginStart`/`marginEnd` — use `flexDirection` reversal or ternaries
- ❌ Hardcoded API URLs — use `process.env.EXPO_PUBLIC_API_URL`
- ❌ `transform: scaleX(-1)` on directional icons — swap the icon name
