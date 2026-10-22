import { palette } from "@excalidraw/excalidraw/components/icons";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { WelcomeScreen } from "@excalidraw/excalidraw/index";
import React from "react";
import { DrawoLogoIcon } from "./DrawoLogo";

const folderIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
  </svg>
);

export const AppWelcomeScreen: React.FC<{
  onCollabDialogOpen: () => any;
  isCollabEnabled: boolean;
  onLoadDemo?: () => void;
  onOpenWorkspace?: () => void;
}> = React.memo((props) => {
  const { t } = useI18n();
  const headingContent = "Hand-drawn whiteboard, free, local and private";

  return (
    <WelcomeScreen>
      <WelcomeScreen.Hints.MenuHint>
        {t("welcomeScreen.app.menuHint")}
      </WelcomeScreen.Hints.MenuHint>
      <WelcomeScreen.Hints.ToolbarHint />
      <WelcomeScreen.Hints.HelpHint />
      <WelcomeScreen.Center>
        <div
          style={{
            fontSize: "48px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "14px",
            marginBottom: "12px",
            userSelect: "none",
          }}
        >
          <DrawoLogoIcon size={48} color="var(--color-primary)" />
          <span
            className="excalifont"
            style={{
              fontFamily: "Excalifont, Virgil, cursive, sans-serif",
              letterSpacing: "3px",
              color: "var(--color-on-surface, #1e293b)",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            DRAWO
          </span>
        </div>
        <WelcomeScreen.Center.Heading>
          {headingContent}
        </WelcomeScreen.Center.Heading>
        <WelcomeScreen.Center.Menu>
          <WelcomeScreen.Center.MenuItemLoadScene />
          {props.onOpenWorkspace && (
            <WelcomeScreen.Center.MenuItem
              shortcut={null}
              icon={folderIcon}
              onSelect={props.onOpenWorkspace}
            >
              Workspace Boards
            </WelcomeScreen.Center.MenuItem>
          )}
          {props.onLoadDemo && (
            <WelcomeScreen.Center.MenuItem
              shortcut={null}
              icon={palette}
              onSelect={props.onLoadDemo}
            >
              Load Drawo Demo
            </WelcomeScreen.Center.MenuItem>
          )}
          <WelcomeScreen.Center.MenuItemHelp />
          {props.isCollabEnabled && (
            <WelcomeScreen.Center.MenuItemLiveCollaborationTrigger
              onSelect={() => props.onCollabDialogOpen()}
            />
          )}
        </WelcomeScreen.Center.Menu>
      </WelcomeScreen.Center>
    </WelcomeScreen>
  );
});
