import { Component } from "react";
import type { ErrorInfo, ReactElement, ReactNode } from "react";

interface MapErrorBoundaryProps {
  readonly children: ReactNode;
}

interface MapErrorBoundaryState {
  readonly hasError: boolean;
}

/**
 * 地図コンポーネント専用のエラーバウンダリ。
 *
 * WebGL が無効なブラウザ・環境では MapLibre が例外を投げる。エラーバウンダリが
 * 無いと React ツリー全体がアンマウントされ、地図以外のタブや検索も使えなく
 * なるため、ここで「地図は表示できないが、他の機能は継続できる」縮退状態にする。
 * (Unknown is not Safe: 地図が使えないことを成功として隠さない。)
 */
export class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  override state: MapErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 詳細はコンソールにのみ出力する (画面には利用者向けの案内だけを出す)。
    console.error("MapView failed to render", error, info.componentStack);
  }

  override render(): ReactElement {
    if (this.state.hasError) {
      return (
        <div className="map-view map-view--error" role="alert">
          <p className="map-error-title">地図を表示できませんでした。</p>
          <p>
            お使いのブラウザが WebGL に対応していない可能性があります。最新版の Chrome / Edge /
            Firefox をお試しください。地図以外の機能は引き続き利用できます。
          </p>
          <button type="button" className="btn" onClick={() => this.setState({ hasError: false })}>
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children as ReactElement;
  }
}
