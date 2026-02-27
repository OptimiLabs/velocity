#!/usr/bin/env python3
"""Capture deterministic Velocity product demos as GIF + WebM (optional MP4)."""

from __future__ import annotations

import argparse
import math
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Pillow is required. Install with: pip install pillow"
    ) from exc

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import Browser, Page, sync_playwright
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Playwright is required. Install with: pip install playwright && playwright install chromium"
    ) from exc


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = ROOT / "docs" / "assets" / "demo"
VIEWPORT = {"width": 1600, "height": 900}
RESOLVED_WORKFLOW_ROUTE = "/workflows/wf_demo_claude_release"
RESOLVED_SESSION_IDS: list[str] = []


@dataclass
class Scenario:
    key: str
    title: str
    route: str
    runner: Callable[[Page, Callable[[int], None]], None]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Capture scripted Velocity demos into GIF/WebM assets.",
    )
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:3000",
        help="Base URL for a running Velocity instance.",
    )
    parser.add_argument(
        "--out-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory to write generated assets.",
    )
    parser.add_argument(
        "--provider",
        default="claude",
        choices=["claude", "codex", "gemini"],
        help="Provider scope to preload before capture.",
    )
    parser.add_argument(
        "--gif-ms",
        type=int,
        default=150,
        help="Milliseconds per GIF frame.",
    )
    parser.add_argument(
        "--target-seconds",
        type=float,
        default=12.0,
        help="Target per-scenario GIF length in seconds.",
    )
    return parser.parse_args()


def ensure_app_ready(base_url: str) -> None:
    import urllib.request

    try:
        with urllib.request.urlopen(base_url, timeout=8):
            return
    except Exception as exc:  # pragma: no cover
        raise SystemExit(
            f"Could not reach {base_url}. Start Velocity first (bun dev), then rerun capture."
        ) from exc


def resolve_workflow_route(base_url: str) -> str:
    import json
    import urllib.request

    fallback = "/workflows/wf_demo_claude_release"
    try:
        with urllib.request.urlopen(f"{base_url}/api/workflows", timeout=8) as response:
            data = json.load(response)
    except Exception:
        return fallback

    if not isinstance(data, list) or not data:
        return fallback

    def node_count(item: object) -> int:
        if not isinstance(item, dict):
            return 0
        nodes = item.get("nodes")
        return len(nodes) if isinstance(nodes, list) else 0

    def generated_plan_score(item: object) -> int:
        if not isinstance(item, dict):
            return 0
        plan = item.get("generatedPlan")
        return 1 if isinstance(plan, str) and plan.strip() else 0

    def score(item: object) -> tuple[int, int]:
        return (generated_plan_score(item), node_count(item))

    best = max(data, key=score)
    workflow_id = best.get("id") if isinstance(best, dict) else None
    if isinstance(workflow_id, str) and workflow_id:
        return f"/workflows/{workflow_id}"
    return fallback


def resolve_session_ids(base_url: str, *, count: int = 3) -> list[str]:
    import json
    import urllib.request
    import urllib.parse

    params = urllib.parse.urlencode(
        {
            "sortBy": "modified_at",
            "sortDir": "DESC",
            "limit": "80",
            "minMessages": "1",
        }
    )
    try:
        with urllib.request.urlopen(f"{base_url}/api/sessions?{params}", timeout=8) as response:
            data = json.load(response)
    except Exception:
        return []

    sessions = data.get("sessions") if isinstance(data, dict) else None
    if not isinstance(sessions, list):
        return []
    ids: list[str] = []
    for row in sessions:
        if not isinstance(row, dict):
            continue
        sid = row.get("id")
        if isinstance(sid, str) and sid:
            ids.append(sid)
        if len(ids) >= count:
            break
    return ids


def write_gif(frame_paths: list[Path], output_path: Path, frame_ms: int) -> None:
    if not frame_paths:
        raise RuntimeError("No frames captured for GIF output")
    frames = [Image.open(path).convert("RGB") for path in frame_paths]
    first, rest = frames[0], frames[1:]
    first.save(
        output_path,
        save_all=True,
        append_images=rest,
        optimize=True,
        duration=frame_ms,
        loop=0,
    )
    for frame in frames:
        frame.close()


def maybe_convert_webm_to_mp4(webm_path: Path, mp4_path: Path) -> bool:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return False
    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(webm_path),
        "-movflags",
        "+faststart",
        "-pix_fmt",
        "yuv420p",
        str(mp4_path),
    ]
    completed = subprocess.run(cmd, capture_output=True, text=True, check=False)
    return completed.returncode == 0 and mp4_path.exists()


def new_page(browser: Browser, video_dir: Path, provider: str):
    context = browser.new_context(
        viewport=VIEWPORT,
        record_video_dir=str(video_dir),
        record_video_size=VIEWPORT,
    )
    payload = (
        '{ "state": { "providerScope": "%s" }, "version": 1 }' % provider
    )
    context.add_init_script(
        f"window.localStorage.setItem('provider-scope', '{payload}');"
    )
    context.add_init_script(
        """
        (() => {
          const style = document.createElement('style');
          style.innerHTML = `
            * { scroll-behavior: auto !important; }
            #demo-cursor {
              position: fixed;
              left: 0;
              top: 0;
              width: 14px;
              height: 14px;
              border-radius: 9999px;
              background: rgba(255, 255, 255, 0.95);
              border: 1.5px solid rgba(15, 23, 42, 0.85);
              box-shadow:
                0 0 0 2px rgba(59, 130, 246, 0.35),
                0 4px 14px rgba(2, 6, 23, 0.3);
              transform: translate(-50%, -50%);
              pointer-events: none;
              z-index: 2147483647;
              transition:
                width 80ms ease,
                height 80ms ease,
                box-shadow 80ms ease;
            }
            #demo-cursor.demo-cursor-down {
              width: 11px;
              height: 11px;
              box-shadow:
                0 0 0 3px rgba(59, 130, 246, 0.45),
                0 2px 10px rgba(2, 6, 23, 0.26);
            }
          `;
          document.head.appendChild(style);

          const mountCursor = () => {
            if (document.getElementById('demo-cursor')) return;
            const cursor = document.createElement('div');
            cursor.id = 'demo-cursor';
            cursor.setAttribute('aria-hidden', 'true');
            cursor.style.left = '120px';
            cursor.style.top = '120px';
            document.body.appendChild(cursor);

            const move = (x, y) => {
              cursor.style.left = `${x}px`;
              cursor.style.top = `${y}px`;
            };

            document.addEventListener(
              'mousemove',
              (event) => move(event.clientX, event.clientY),
              { passive: true },
            );
            document.addEventListener(
              'pointermove',
              (event) => move(event.clientX, event.clientY),
              { passive: true },
            );
            document.addEventListener(
              'mousedown',
              () => cursor.classList.add('demo-cursor-down'),
              { passive: true },
            );
            document.addEventListener(
              'mouseup',
              () => cursor.classList.remove('demo-cursor-down'),
              { passive: true },
            );
          };

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', mountCursor, {
              once: true,
            });
          } else {
            mountCursor();
          }
        })();
        """
    )
    page = context.new_page()
    page.set_default_timeout(18_000)
    return context, page


def _origin_from_page(page: Page) -> str:
    from urllib.parse import urlsplit

    parsed = urlsplit(page.url)
    return f"{parsed.scheme}://{parsed.netloc}"


def _goto_same_origin(page: Page, route: str) -> None:
    page.goto(f"{_origin_from_page(page)}{route}", wait_until="domcontentloaded")


def _human_click(page: Page, locator, hold: Callable[[int], None], *, after: int = 2) -> bool:
    if locator.count() == 0:
        return False
    box = locator.bounding_box()
    if box:
        cx = box["x"] + box["width"] * 0.5
        cy = box["y"] + box["height"] * 0.5
        page.mouse.move(cx, cy, steps=16)
        page.wait_for_timeout(80)
    locator.click(force=True)
    page.wait_for_timeout(130)
    hold(after)
    return True


def _click_if_in_view(page: Page, locator, hold: Callable[[int], None], *, after: int = 2) -> bool:
    if locator.count() == 0:
        return False
    box = locator.bounding_box()
    if not box:
        return False
    right = box["x"] + box["width"]
    bottom = box["y"] + box["height"]
    if right < 0 or bottom < 0:
        return False
    if box["x"] > VIEWPORT["width"] or box["y"] > VIEWPORT["height"]:
        return False
    return _human_click(page, locator, hold, after=after)


def scenario_workflow_builder(page: Page, hold: Callable[[int], None]) -> None:
    # 1) Start with AI Assist in workflows list.
    page.wait_for_selector("button:has-text('New Workflow')")
    page.wait_for_timeout(240)
    hold(3)

    _human_click(page, page.locator("button:has-text('New Workflow')").first, hold, after=3)
    page.wait_for_selector("[aria-label='AI Assist mode']")
    _human_click(page, page.locator("[aria-label='AI Assist mode']").first, hold, after=3)

    prompt_area = page.locator(
        "textarea[placeholder*='Review all PRs'], textarea[placeholder*='workflow do']"
    ).first
    if prompt_area.count() > 0:
        _human_click(page, prompt_area, hold, after=2)
        prompt_area.fill(
            "Plan and execute a release workflow with task planning, implementation, verification, and deployment notes."
        )
        page.wait_for_timeout(220)
        hold(3)

    name_input = page.locator("input[placeholder*='Auto-derived from prompt']").first
    if name_input.count() > 0:
        _human_click(page, name_input, hold, after=2)
        name_input.fill("Release Train AI Workflow")
        page.wait_for_timeout(160)
        hold(2)

    detail_depth = page.locator("[aria-label='Detailed planning depth']").first
    if detail_depth.count() > 0:
        _human_click(page, detail_depth, hold, after=2)

    generate_btn = page.locator("button:has-text('Generate In Background')").first
    if generate_btn.count() > 0:
        _human_click(page, generate_btn, hold, after=3)
        page.wait_for_timeout(700)
        hold(5)

    # 2) Jump to finished workflow state and inspect/edit.
    _goto_same_origin(page, RESOLVED_WORKFLOW_ROUTE)
    page.wait_for_selector(".react-flow")
    try:
        page.wait_for_selector(".react-flow__node", timeout=6000)
    except PlaywrightTimeoutError:
        pass
    page.wait_for_timeout(250)
    hold(4)

    _human_click(page, page.get_by_role("button", name="Fullscreen").first, hold, after=4)
    fit_view = page.locator("button[title='Fit view'], button[title='Fit View']").first
    if fit_view.count() > 0:
        _human_click(page, fit_view, hold, after=3)

    for title in ("Collapse inventory panel", "Collapse details panel"):
        toggle = page.locator(f"button[title='{title}']").first
        if toggle.count() > 0:
            _human_click(page, toggle, hold, after=2)

    zoom_in = page.locator("button[title='Zoom in'], button[title='Zoom In']").first
    if zoom_in.count() > 0:
        for _ in range(2):
            _human_click(page, zoom_in, hold, after=2)

    target_node = page.locator(".react-flow__node:has-text('Implement')").first
    if target_node.count() == 0:
        target_node = page.locator(".react-flow__node").first
    if _click_if_in_view(page, target_node, hold, after=4):
        box = target_node.bounding_box()
        if box:
            sx = box["x"] + box["width"] * 0.55
            sy = box["y"] + box["height"] * 0.5
            page.mouse.move(sx, sy, steps=18)
            page.mouse.down()
            page.mouse.move(sx + 95, sy + 42, steps=18)
            page.mouse.up()
            page.wait_for_timeout(220)
            hold(4)

    ai_prompt_btn = page.locator("button:has-text('AI Prompt')").first
    if ai_prompt_btn.count() > 0:
        _human_click(page, ai_prompt_btn, hold, after=3)
    collapse_ai_prompt = page.locator("button[title='Collapse AI prompt']").first
    if collapse_ai_prompt.count() > 0:
        _human_click(page, collapse_ai_prompt, hold, after=2)
        _human_click(page, page.locator("button:has-text('AI Prompt')").first, hold, after=3)

    visible_node_count = page.locator(".react-flow__node").count()
    for idx in (1, 2, 3):
        if visible_node_count > idx:
            if _click_if_in_view(page, page.locator(".react-flow__node").nth(idx), hold, after=2):
                page.wait_for_timeout(150)
                hold(1)

    expand_details = page.locator("button[title='Expand details panel']").first
    if expand_details.count() > 0:
        _human_click(page, expand_details, hold, after=3)
    edit_btn = page.locator("button:has-text('Edit')").first
    if edit_btn.count() > 0:
        _human_click(page, edit_btn, hold, after=3)
        prompt_editor = page.locator("textarea[placeholder='System prompt for the agent...']").first
        if prompt_editor.count() > 0:
            _human_click(page, prompt_editor, hold, after=2)
            prompt_editor.press("End")
            page.keyboard.type(
                "\n- Add a concise release summary and rollout checklist in the final response.",
                delay=10,
            )
            page.wait_for_timeout(220)
            hold(4)
        cancel_btn = page.locator("button:has-text('Cancel')").first
        if cancel_btn.count() > 0:
            _human_click(page, cancel_btn, hold, after=2)

    _human_click(page, page.get_by_role("button", name="Exit Fullscreen").first, hold, after=3)
    hold(7)


def scenario_routing(page: Page, hold: Callable[[int], None]) -> None:
    page.wait_for_selector("text=Routing Graph")
    page.wait_for_timeout(420)
    hold(4)

    fullscreen_btn = page.locator("button:has(svg.lucide-maximize-2)").first
    if fullscreen_btn.count() > 0:
        _human_click(page, fullscreen_btn, hold, after=4)

    fit_view = page.locator("button[title='Fit view'], button[title='Fit View']").first
    if fit_view.count() > 0:
        _human_click(page, fit_view, hold, after=3)

    # Zoom for readability while still keeping a broad node set on screen.
    zoom_in = page.locator("button[title='Zoom in'], button[title='Zoom In']").first
    if zoom_in.count() > 0:
        for _ in range(2):
            _human_click(page, zoom_in, hold, after=2)

    # Pan graph like a human to keep labels readable.
    canvas = page.locator(".react-flow__pane").first
    if canvas.count() > 0:
        box = canvas.bounding_box()
        if box:
            start_x = box["x"] + box["width"] * 0.55
            start_y = box["y"] + box["height"] * 0.55
            page.mouse.move(start_x, start_y, steps=18)
            page.mouse.down()
            page.mouse.move(start_x - 180, start_y - 80, steps=28)
            page.mouse.up()
            page.wait_for_timeout(220)
            hold(3)

    # Click through up to 10 visible nodes so users can actually read/inspect them.
    nodes = page.locator(".react-flow__node")
    total_nodes = nodes.count()
    clicked = 0
    for idx in range(total_nodes):
        if clicked >= 10:
            break
        if _click_if_in_view(page, nodes.nth(idx), hold, after=2):
            clicked += 1
            page.wait_for_timeout(120)

    hold(8)

    # Keep Files panel interaction for layout context.
    files_btn = page.get_by_role("button", name="Files").first
    if files_btn.count() > 0:
        _human_click(page, files_btn, hold, after=3)
        close_files = page.locator("button[aria-label='Close knowledge files panel']").first
        if close_files.count() > 0:
            _human_click(page, close_files, hold, after=2)

    minimize_btn = page.locator("button:has(svg.lucide-minimize-2)").first
    if minimize_btn.count() > 0:
        _human_click(page, minimize_btn, hold, after=3)
    hold(6)


def scenario_console(page: Page, hold: Callable[[int], None]) -> None:
    try:
        page.wait_for_selector("button[title='Add terminal session']", timeout=7000)
    except PlaywrightTimeoutError:
        try:
            page.wait_for_selector("button:has-text('New Workspace')", timeout=7000)
        except PlaywrightTimeoutError:
            page.wait_for_selector("text=Open a terminal", timeout=7000)
    page.wait_for_timeout(520)
    hold(5)

    # Create/open session content so terminal layout is visible.
    add_terminal_btn = page.locator("button[title='Add terminal session']").first
    if add_terminal_btn.count() > 0:
        _human_click(page, add_terminal_btn, hold, after=3)
        page.wait_for_timeout(550)
        hold(3)
    else:
        create_workspace_btn = page.locator(
            "button:has-text('New Workspace'), button:has-text('New')"
        ).first
        if create_workspace_btn.count() > 0:
            _human_click(page, create_workspace_btn, hold, after=3)
            page.wait_for_timeout(700)
            hold(3)

    # Open a terminal pane if the empty-state action is present.
    open_terminal_btn = page.get_by_role("button", name="Open a terminal").first
    if open_terminal_btn.count() > 0:
        _human_click(page, open_terminal_btn, hold, after=3)
        page.wait_for_timeout(600)
        hold(3)

    # Explicit multipanel action: split the active pane to the right.
    split_right_btn = page.locator("button[title^='Split right']").first
    if split_right_btn.count() > 0:
        _human_click(page, split_right_btn, hold, after=3)
        page.wait_for_timeout(600)
        hold(3)
        split_down_btn = page.locator("button[title^='Split down']").first
        if split_down_btn.count() > 0:
            _human_click(page, split_down_btn, hold, after=3)
            page.wait_for_timeout(500)
            hold(3)

    # Show both layout modes briefly.
    tabbed_btn = page.locator("button[title='Tabbed View']").first
    tiling_btn = page.locator("button[title^='Tiling View']").first
    if tabbed_btn.count() > 0 and tiling_btn.count() > 0:
        _human_click(page, tiling_btn, hold, after=2)
        page.wait_for_timeout(250)
        hold(2)
        _human_click(page, tabbed_btn, hold, after=2)
        page.wait_for_timeout(250)
        hold(2)

    # Expand session list and switch focus when session rows are available.
    show_sessions_btn = page.locator("button[title='Show sessions']").first
    if show_sessions_btn.count() > 0:
        _human_click(page, show_sessions_btn, hold, after=2)
        page.wait_for_timeout(300)
        hold(2)

    session_row = page.locator("[class*='group/session']").first
    if session_row.count() > 0:
        _human_click(page, session_row, hold, after=2)
        page.wait_for_timeout(300)
        hold(2)

    # Enter/exit fullscreen to show focused console mode.
    fullscreen_btn = page.locator("button[title='Fullscreen']").first
    if fullscreen_btn.count() > 0:
        _human_click(page, fullscreen_btn, hold, after=3)
        page.wait_for_timeout(300)
        hold(3)

    exit_fullscreen_btn = page.locator("button[title='Exit fullscreen']").first
    if exit_fullscreen_btn.count() > 0:
        _human_click(page, exit_fullscreen_btn, hold, after=3)
        page.wait_for_timeout(350)
    hold(8)


def scenario_sessions_journey(page: Page, hold: Callable[[int], None]) -> None:
    # Console start.
    try:
        page.wait_for_selector("button[title='Add terminal session']", timeout=7000)
    except PlaywrightTimeoutError:
        page.wait_for_selector("text=Open a terminal", timeout=7000)
    page.wait_for_timeout(380)
    hold(3)

    # Navigate to Sessions.
    sessions_link = page.get_by_role("link", name="Sessions").first
    if sessions_link.count() > 0:
        _human_click(page, sessions_link, hold, after=4)
    else:
        _goto_same_origin(page, "/sessions")
        page.wait_for_timeout(250)
        hold(3)

    page.wait_for_selector("text=Sessions")
    page.wait_for_timeout(260)
    hold(3)

    # Open a concrete session detail.
    opened = False
    if RESOLVED_SESSION_IDS:
        detail_route = f"/sessions/{RESOLVED_SESSION_IDS[0]}"
        detail_link = page.locator(f"a[href='{detail_route}']").first
        if detail_link.count() > 0:
            opened = _human_click(page, detail_link, hold, after=4)
        if not opened:
            _goto_same_origin(page, detail_route)
            page.wait_for_timeout(260)
            hold(3)
            opened = True

    if not opened:
        fallback_link = page.locator("a[href^='/sessions/']").first
        if fallback_link.count() > 0:
            _human_click(page, fallback_link, hold, after=4)

    page.wait_for_selector("button:has-text('Review Session')")
    page.wait_for_timeout(280)
    hold(4)

    # Scroll through detail + transcript area.
    page.mouse.move(VIEWPORT["width"] * 0.62, VIEWPORT["height"] * 0.72, steps=18)
    page.mouse.wheel(0, 560)
    page.wait_for_timeout(220)
    hold(3)
    page.mouse.wheel(0, -420)
    page.wait_for_timeout(180)
    hold(2)

    # Transcript filter interactions: All / My Prompts / Thinking / Text Only / Tools.
    for label in ("My Prompts", "Thinking", "Text Only", "All"):
        btn = page.locator(f"button:has-text('{label}')").first
        if btn.count() > 0:
            _human_click(page, btn, hold, after=2)
    tools_btn = page.locator("button:has-text('Tools')").first
    if tools_btn.count() > 0:
        _human_click(page, tools_btn, hold, after=2)
        tool_option = page.locator("button:has-text('All tools')").first
        if tool_option.count() > 0:
            _human_click(page, tool_option, hold, after=2)

    # Scroll deeper into session detail and open tool Input / Result payloads.
    page.mouse.move(VIEWPORT["width"] * 0.65, VIEWPORT["height"] * 0.72, steps=18)
    page.mouse.wheel(0, 760)
    page.wait_for_timeout(220)
    hold(3)

    input_toggle = page.locator("div[role='button']:has-text('Input')").first
    if input_toggle.count() > 0:
        _human_click(page, input_toggle, hold, after=3)
    result_toggle = page.locator("div[role='button']:has-text('Result')").first
    if result_toggle.count() > 0:
        _human_click(page, result_toggle, hold, after=3)

    # Briefly close/re-open one section like a user exploring details.
    if input_toggle.count() > 0:
        _human_click(page, input_toggle, hold, after=2)
        _human_click(page, input_toggle, hold, after=2)

    # Final look around on expanded details.
    page.mouse.move(VIEWPORT["width"] * 0.76, VIEWPORT["height"] * 0.48, steps=16)
    page.wait_for_timeout(180)
    hold(7)


def scenario_review_compare(page: Page, hold: Callable[[int], None]) -> None:
    if len(RESOLVED_SESSION_IDS) >= 2:
        ids_param = ",".join(RESOLVED_SESSION_IDS[:2])
        _goto_same_origin(page, f"/analyze?ids={ids_param}&scope=metrics,summaries")
    else:
        _goto_same_origin(page, "/analyze")

    page.wait_for_selector("text=Review")
    page.wait_for_timeout(320)
    hold(4)

    # Toggle between session cards in compare workspace.
    cards = page.locator("button:has-text('msgs')")
    if cards.count() > 1:
        _human_click(page, cards.nth(1), hold, after=3)
        _human_click(page, cards.nth(1), hold, after=2)
    elif cards.count() > 0:
        _human_click(page, cards.first, hold, after=2)

    # Scope preset and checkbox interactions.
    for label in ("Balanced", "Deep", "Lean"):
        preset_btn = page.locator(f"button:has-text('{label}')").first
        if preset_btn.count() > 0:
            _human_click(page, preset_btn, hold, after=2)
    for label in ("User prompts", "Responses", "Tool details"):
        scope_toggle = page.locator(f"label:has-text('{label}')").first
        if scope_toggle.count() > 0:
            _human_click(page, scope_toggle, hold, after=2)

    # Explore message controls + chat entry area without submitting.
    msg_limit_trigger = page.locator("button[role='combobox']").first
    if msg_limit_trigger.count() > 0:
        _human_click(page, msg_limit_trigger, hold, after=2)
        option = page.locator("div[role='option']:has-text('100 messages')").first
        if option.count() > 0:
            _human_click(page, option, hold, after=2)

    input_box = page.locator("textarea[placeholder='Ask a follow-up question...']").first
    if input_box.count() > 0:
        _human_click(page, input_box, hold, after=2)
        input_box.fill("Compare these two sessions and highlight the better execution strategy.")
        page.wait_for_timeout(200)
        hold(3)

    hold(6)


def capture_scenario(
    browser: Browser,
    base_url: str,
    out_dir: Path,
    provider: str,
    scenario: Scenario,
    frame_ms: int,
    target_seconds: float,
) -> None:
    frames_dir = out_dir / "_frames" / scenario.key
    frames_dir.mkdir(parents=True, exist_ok=True)
    video_dir = out_dir / "_raw-video"
    video_dir.mkdir(parents=True, exist_ok=True)

    frame_paths: list[Path] = []
    frame_index = 0

    def snap(duplication: int = 1) -> None:
        nonlocal frame_index
        shot = frames_dir / f"{frame_index:04d}.png"
        page.screenshot(path=str(shot), full_page=False)
        frame_paths.extend([shot] * max(duplication, 1))
        frame_index += 1

    context, page = new_page(browser, video_dir, provider)
    try:
        page.goto(f"{base_url}{scenario.route}", wait_until="domcontentloaded")
        page.wait_for_timeout(850)
        page.mouse.move(140, 120)
        page.wait_for_timeout(60)
        snap(6)
        scenario.runner(page, snap)
        page.wait_for_timeout(300)
        snap(5)
    except PlaywrightTimeoutError as exc:
        raise RuntimeError(f"Scenario '{scenario.key}' timed out") from exc
    finally:
        page.close()
        video = page.video
        video_path = Path(video.path()) if video is not None else None
        context.close()

    gif_path = out_dir / f"{scenario.key}.gif"
    webm_path = out_dir / f"{scenario.key}.webm"
    target_frames = max(1, math.ceil((target_seconds * 1000) / frame_ms))
    if frame_paths and len(frame_paths) > target_frames:
        if target_frames == 1:
            frame_paths = [frame_paths[-1]]
        else:
            last_index = len(frame_paths) - 1
            selected = []
            for i in range(target_frames):
                idx = round((i * last_index) / (target_frames - 1))
                selected.append(frame_paths[idx])
            frame_paths = selected
    if frame_paths and len(frame_paths) < target_frames:
        frame_paths.extend([frame_paths[-1]] * (target_frames - len(frame_paths)))
    write_gif(frame_paths, gif_path, frame_ms=frame_ms)

    if video_path and video_path.exists():
        shutil.copy2(video_path, webm_path)
        mp4_path = out_dir / f"{scenario.key}.mp4"
        maybe_convert_webm_to_mp4(webm_path, mp4_path)


def stitch_gifs(
    sources: list[Path],
    output: Path,
    *,
    default_duration_ms: int,
    separator_hold_frames: int = 0,
) -> None:
    frames: list[Image.Image] = []
    durations: list[int] = []
    for i, source in enumerate(sources):
        if not source.exists():
            continue
        with Image.open(source) as img:
            while True:
                frame = img.convert("RGB").copy()
                frames.append(frame)
                durations.append(int(img.info.get("duration", default_duration_ms)))
                try:
                    img.seek(img.tell() + 1)
                except EOFError:
                    break
        if separator_hold_frames > 0 and i < len(sources) - 1 and frames:
            for _ in range(separator_hold_frames):
                frames.append(frames[-1].copy())
                durations.append(default_duration_ms)

    if not frames:
        return
    first, rest = frames[0], frames[1:]
    first.save(
        output,
        save_all=True,
        append_images=rest,
        optimize=True,
        duration=durations,
        loop=0,
    )
    for frame in frames:
        frame.close()


def stitch_webm_ffmpeg(sources: list[Path], output: Path) -> bool:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return False
    available = [source for source in sources if source.exists()]
    if not available:
        return False

    cmd = [ffmpeg, "-y"]
    for source in available:
        cmd.extend(["-i", str(source)])
    stream_concat = "".join(f"[{i}:v]" for i in range(len(available)))
    cmd.extend(
        [
            "-filter_complex",
            f"{stream_concat}concat=n={len(available)}:v=1:a=0[v]",
            "-map",
            "[v]",
            "-pix_fmt",
            "yuv420p",
            str(output),
        ]
    )
    completed = subprocess.run(cmd, capture_output=True, text=True, check=False)
    return completed.returncode == 0 and output.exists()


def build_demo_reels(out_dir: Path, scenario_keys: list[str], frame_ms: int) -> None:
    gif_sources = [out_dir / f"{key}.gif" for key in scenario_keys]
    webm_sources = [out_dir / f"{key}.webm" for key in scenario_keys]

    stitch_gifs(
        gif_sources,
        out_dir / "demo-back-to-back.gif",
        default_duration_ms=frame_ms,
        separator_hold_frames=0,
    )
    stitch_gifs(
        gif_sources,
        out_dir / "demo-stitched.gif",
        default_duration_ms=frame_ms,
        separator_hold_frames=6,
    )
    if stitch_webm_ffmpeg(webm_sources, out_dir / "demo-back-to-back.webm"):
        maybe_convert_webm_to_mp4(
            out_dir / "demo-back-to-back.webm",
            out_dir / "demo-back-to-back.mp4",
        )


def main() -> None:
    global RESOLVED_WORKFLOW_ROUTE, RESOLVED_SESSION_IDS
    args = parse_args()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    ensure_app_ready(args.base_url)
    RESOLVED_WORKFLOW_ROUTE = resolve_workflow_route(args.base_url)
    RESOLVED_SESSION_IDS = resolve_session_ids(args.base_url, count=4)

    scenarios = [
      Scenario(
          key="workflows-demo",
          title="Workflow AI assist to editable workflow",
          route="/workflows",
          runner=scenario_workflow_builder,
      ),
      Scenario(
          key="routing-demo",
          title="Routing graph analysis",
          route="/routing",
          runner=scenario_routing,
      ),
      Scenario(
          key="sessions-demo",
          title="Console to sessions detail journey",
          route="/",
          runner=scenario_sessions_journey,
      ),
      Scenario(
          key="review-compare-demo",
          title="Review compare workspace",
          route="/analyze",
          runner=scenario_review_compare,
      ),
    ]

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            scenario_keys = [scenario.key for scenario in scenarios]
            for scenario in scenarios:
                print(f"[capture] {scenario.key}")
                capture_scenario(
                    browser=browser,
                    base_url=args.base_url,
                    out_dir=out_dir,
                    provider=args.provider,
                    scenario=scenario,
                    frame_ms=args.gif_ms,
                    target_seconds=args.target_seconds,
                )
            build_demo_reels(out_dir, scenario_keys, frame_ms=args.gif_ms)
        finally:
            browser.close()

    shutil.rmtree(out_dir / "_frames", ignore_errors=True)
    shutil.rmtree(out_dir / "_raw-video", ignore_errors=True)
    print(f"[capture] wrote assets to {out_dir}")


if __name__ == "__main__":
    main()
