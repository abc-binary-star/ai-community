import { notFound } from "next/navigation";
import { MapPreviewClient } from "./preview-client";

/** 仅供本地视觉 QA；生产环境不暴露活动数据或绕过登录。 */
export default function MapPreviewPage() {
  if (process.env.NEXT_PUBLIC_MAP_PREVIEW !== "true") notFound();
  return <MapPreviewClient />;
}
