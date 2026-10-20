import { useI18n } from "@excalidraw/excalidraw/i18n";
import { WelcomeScreen } from "@excalidraw/excalidraw/index";
import React from "react";

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
            fontSize: "44px",
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            marginBottom: "10px",
            userSelect: "none",
          }}
        >
          <span>✏️</span>
          <span>drawo</span>
        </div>
        <WelcomeScreen.Center.Heading>
          {headingContent}
        </WelcomeScreen.Center.Heading>
        <WelcomeScreen.Center.Menu>
          <WelcomeScreen.Center.MenuItemLoadScene />
          {props.onOpenWorkspace && (
            <WelcomeScreen.Center.MenuItem
              shortcut={null}
              icon={<span>📁</span>}
              onSelect={props.onOpenWorkspace}
            >
              Workspace Boards
            </WelcomeScreen.Center.MenuItem>
          )}
          {props.onLoadDemo && (
            <WelcomeScreen.Center.MenuItem
              shortcut={null}
              icon={<span>🎨</span>}
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
