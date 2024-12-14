import {HandInputData} from "../../Providers/HandInputData/HandInputData"
import {HandType} from "../../Providers/HandInputData/HandType"
import TrackedHand from "../../Providers/HandInputData/TrackedHand"
import TargetProvider, {
  InteractableHitInfo,
} from "../../Providers/TargetProvider/TargetProvider"
import {validate} from "../../Utils/validate"
import BaseInteractor from "../Interactor/BaseInteractor"
import {DirectTargetProvider} from "../Interactor/DirectTargetProvider"
import {DragProvider} from "../Interactor/DragProvider"
import {HandRayProvider} from "../Interactor/HandRayProvider"
import IndirectTargetProvider from "../Interactor/IndirectTargetProvider"
import {
  InteractorInputType,
  InteractorTriggerType,
  TargetingMode,
} from "../Interactor/Interactor"
import {PokeTargetProvider} from "../Interactor/PokeTargetProvider"

/**
 * Enum representing the types of raycasts available for hand interactions.
 */
export type RaycastType =
  | "AnchorShoulder"
  | "AnchorVariableShoulder"
  | "LegacySingleCamera"
  | "AnchorHead"
  | "Proxy"

const TAG = "HandInteractor"
const HANDUI_INTERACTION_DISTANCE_THRESHOLD_CM = 15

/**
 * This class handles hand interactions within the Spectacles Interaction Kit. It provides various configurations for hand types and raycast types.
 *
 */
@component
export class HandInteractor extends BaseInteractor {
  @ui.group_start("Hand Interactor")
  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Left", "left"),
      new ComboBoxItem("Right", "right"),
    ]),
  )
  private handType: string = "right"
  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("AnchorVariableShoulder", "AnchorVariableShoulder"),
      new ComboBoxItem("LegacySingleCamera", "LegacySingleCamera"),
      new ComboBoxItem("AnchorHead", "AnchorHead"),
      new ComboBoxItem("Proxy", "Proxy"),
    ]),
  )
  @hint("Forwards the TargetingData received from LensCore's Gesture Module")
  private raycastAlgorithm: string = "Proxy"
  @input
  @hint(
    "Forces the usage of Poke targeting when interacting near the nondominant hand's palm.",
  )
  private forcePokeOnNonDominantPalmProximity: boolean = false

  @input
  @hint(
    "The radius around the midpoint of the index/thumb to target Interactables.",
  )
  private directColliderEnterRadius: number = 1

  @input
  @hint(
    "The radius around the midpoint of the index/thumb to de-target Interactables (for bistable thresholding).",
  )
  private directColliderExitRadius: number = 1.5

  @input
  private directDragThreshold: number = 3.0
  @ui.group_end
  protected handProvider: HandInputData = HandInputData.getInstance()

  private hand: TrackedHand | undefined

  private handRayProvider: HandRayProvider | undefined

  private indirectTargetProvider: IndirectTargetProvider | undefined
  private indirectDragProvider: DragProvider | undefined

  private directTargetProvider: DirectTargetProvider | undefined
  private directDragProvider: DragProvider | undefined

  private pokeTargetProvider: PokeTargetProvider | undefined
  private activeTargetProvider: TargetProvider | undefined

  onAwake(): void {
    this.inputType =
      this.handType === "left"
        ? InteractorInputType.LeftHand
        : InteractorInputType.RightHand

    this.hand = this.handProvider.getHand(this.handType as HandType)

    this.handRayProvider = new HandRayProvider({
      handType: this.handType as HandType,
      raycastAlgorithm: this.raycastAlgorithm as RaycastType,
    })

    this.indirectTargetProvider = new IndirectTargetProvider(
      this as BaseInteractor,
      {
        maxRayDistance: this.maxRaycastDistance,
        rayProvider: this.handRayProvider,
        targetingVolumeMultiplier: this.indirectTargetingVolumeMultiplier,
        shouldPreventTargetUpdate: () => {
          return this.preventTargetUpdate()
        },
        spherecastRadii: this.spherecastRadii,
        spherecastDistanceThresholds: this.spherecastDistanceThresholds,
      },
    )
    this.indirectDragProvider = new DragProvider(this.indirectDragThreshold)

    if (this.directColliderEnterRadius >= this.directColliderExitRadius) {
      throw Error(
        `The direct collider enter radius should be less than the exit radius for bistable threshold behavior.`,
      )
    }

    this.directTargetProvider = new DirectTargetProvider(
      this as BaseInteractor,
      {
        handType: this.handType as HandType,
        shouldPreventTargetUpdate: () => {
          return this.preventTargetUpdate()
        },
        debugEnabled: this.drawDebug,
        colliderEnterRadius: this.directColliderEnterRadius,
        colliderExitRadius: this.directColliderExitRadius,
      },
    )
    this.directDragProvider = new DragProvider(this.directDragThreshold)

    this.pokeTargetProvider = new PokeTargetProvider({
      handType: this.handType as HandType,
      drawDebug: this.drawDebug,
    })

    this.activeTargetProvider = this.indirectTargetProvider
    this.dragProvider = this.indirectDragProvider

    this.defineSceneEvents()
  }

  get startPoint(): vec3 | null {
    return this.activeTargetProvider?.startPoint ?? null
  }

  get endPoint(): vec3 | null {
    return this.activeTargetProvider?.endPoint ?? null
  }

  get direction(): vec3 | null {
    const proposedDirection =
      this.activeTargetingMode === TargetingMode.Poke
        ? this.pokeTargetProvider?.direction
        : this.indirectTargetProvider?.direction

    return proposedDirection ?? null
  }

  get orientation(): quat | null {
    return this.hand?.getPinchDirection() ?? null
  }

  get distanceToTarget(): number | null {
    return (
      this.activeTargetProvider?.currentInteractableHitInfo?.hit.distance ??
      null
    )
  }

  get targetHitPosition(): vec3 | null {
    return (
      this.activeTargetProvider?.currentInteractableHitInfo?.hit.position ??
      null
    )
  }

  get targetHitInfo(): InteractableHitInfo | null {
    return this.activeTargetProvider?.currentInteractableHitInfo ?? null
  }

  get activeTargetingMode(): TargetingMode {
    return this.activeTargetProvider?.targetingMode ?? TargetingMode.None
  }

  get maxRaycastDistance(): number {
    return this._maxRaycastDistance
  }

  get interactionStrength(): number | null {
    const proposedStrength =
      this.activeTargetingMode === TargetingMode.Poke
        ? this.pokeTargetProvider?.getInteractionStrength()
        : this.hand?.getPinchStrength()

    return proposedStrength ?? null
  }

  /**
   * Set if the Interactor is should draw a debug gizmo of collider/raycasts in the scene.
   */
  set drawDebug(debug: boolean) {
    validate(this.indirectTargetProvider)
    validate(this.directTargetProvider)
    validate(this.pokeTargetProvider)
    this._drawDebug = debug

    this.indirectTargetProvider.drawDebug = debug
    this.directTargetProvider.drawDebug = debug
    this.pokeTargetProvider.drawDebug = debug
  }

  /**
   * @returns if the Interactor is currently drawing a debug gizmo of collider/raycasts in the scene.
   */
  get drawDebug(): boolean {
    return this._drawDebug
  }

  override updateState(): void {
    super.updateState()
    this.updateTarget()
    this.updateDragVector()
  }

  protected override clearDragProviders(): void {
    this.directDragProvider?.clear()
    this.indirectDragProvider?.clear()
    this.planecastDragProvider.clear()
  }

  override get planecastDragVector(): vec3 | null {
    // If the hand has been recently found, return vec3.zero() to allow time to determine if pinch is sustained.
    if (this.hand === undefined) return vec3.zero()
    return this.hand.isRecentlyFound()
      ? vec3.zero()
      : this.planecastDragProvider.currentDragVector
  }

  protected override set currentDragVector(dragVector: vec3 | null) {
    this._currentDragVector = dragVector
  }

  override get currentDragVector(): vec3 | null {
    // If the hand has been recently found, return vec3.zero() to allow time to determine if pinch is sustained.
    if (this.hand === undefined) return vec3.zero()
    return this.hand.isRecentlyFound() ? vec3.zero() : this._currentDragVector
  }

  override get planecastPoint(): vec3 | null {
    if (this.activeTargetProvider === this.indirectTargetProvider) {
      return this.raycastPlaneIntersection(this.currentInteractable)
    } else {
      return this.colliderPlaneIntersection(this.currentInteractable)
    }
  }

  isTargeting(): boolean {
    return this.hand?.isInTargetingPose() ?? false
  }

  /**
   * Returns true if the hand interactor and the hand it is associated with are both enabled.
   */
  isActive(): boolean {
    return this.enabled && (this.hand?.enabled ?? false)
  }

  /**
   * Returns true if the hand this interactor is associated with is both enabled and tracked.
   */
  isTracking(): boolean {
    validate(this.hand)

    return this.hand.enabled && this.hand.isTracked()
  }

  protected clearCurrentHitInfo(): void {
    this.indirectTargetProvider?.clearCurrentInteractableHitInfo()
    this.directTargetProvider?.clearCurrentInteractableHitInfo()
    this.pokeTargetProvider?.clearCurrentInteractableHitInfo()
  }

  /** @inheritdoc */
  override setInputEnabled(enabled: boolean): void {
    super.setInputEnabled(enabled)
    this.handProvider.getHand(this.handType as HandType).setEnabled(enabled)
  }

  private defineSceneEvents() {
    this.createEvent("OnDestroyEvent").bind(() => {
      this.onDestroy()
    })
  }

  private updateTarget(): void {
    if (!this.isActive()) {
      this.indirectTargetProvider?.reset()
      return
    }

    this.pokeTargetProvider?.update()

    // Workaround to get onTriggerExit event on poke end, since poke doesn't use hover
    // Otherwise, the interaction manager will by default do an onTriggerCanceled event.
    if (
      !this.isPoking() &&
      this.previousTrigger === InteractorTriggerType.Poke
    ) {
      this.currentTrigger = InteractorTriggerType.None
      this.currentInteractable = this.previousInteractable
      return
    }

    if (this.isPoking()) {
      this.activeTargetProvider = this.pokeTargetProvider
      this.dragProvider = this.directDragProvider
    } else {
      this.directTargetProvider?.update()
      this.indirectTargetProvider?.update()

      if ((this.previousTrigger & InteractorTriggerType.Select) === 0) {
        if (this.pokeTargetProvider?.hasTarget()) {
          this.activeTargetProvider = this.pokeTargetProvider
          this.dragProvider = this.directDragProvider
        } else if (this.directTargetProvider?.hasTarget()) {
          this.activeTargetProvider = this.directTargetProvider
          this.dragProvider = this.directDragProvider
        } else {
          this.activeTargetProvider = this.indirectTargetProvider
          this.dragProvider = this.indirectDragProvider
        }
      }
    }

    if (this.isPoking()) {
      this.currentTrigger = InteractorTriggerType.Poke
    } else if (
      this.hand &&
      this.hand.isPinching() &&
      (this.previousTrigger & InteractorTriggerType.Poke) === 0
    ) {
      this.currentTrigger = InteractorTriggerType.Pinch
    } else {
      this.currentTrigger = InteractorTriggerType.None
    }

    this.currentInteractable =
      this.activeTargetProvider?.currentInteractableHitInfo?.interactable ??
      null
  }

  private isPoking(): boolean {
    return (
      this.activeTargetProvider === this.pokeTargetProvider &&
      (this.pokeTargetProvider?.isTriggering() ?? false)
    )
  }

  /**
   * @returns if we should prevent any updates to the currently targeted item.
   * In the case of pinching (indirect or direct) or poking, we prevent updates to the targeting system.
   * Otherwise, allow updates to the targeted item.
   */
  private preventTargetUpdate(): boolean {
    return (
      this.hand !== undefined && (this.hand.isPinching() || this.isPoking())
    )
  }

  private isPokingNonDominantHand(): boolean {
    return (
      this.forcePokeOnNonDominantPalmProximity && this.isNearNonDominantHand()
    )
  }

  private isNearNonDominantHand(): boolean {
    const nonDominantHand = this.handProvider.getNonDominantHand()
    const dominantHand = this.handProvider.getDominantHand()

    /** If either the dominant or non-dominant hand is not tracked,
     * or if both hands are in an active targeting pose,
     * then the user is not intending to interact with the nondominant hand UI.
     */
    if (
      !nonDominantHand.isTracked() ||
      !dominantHand.isTracked() ||
      (dominantHand.isInTargetingPose() && nonDominantHand.isInTargetingPose())
    ) {
      return false
    }

    // Detect if dominant index is within interaction proximity to non-dominant palm
    const palmCenter = nonDominantHand.getPalmCenter()
    const dominantIndexTip = dominantHand.indexTip?.position

    return (
      palmCenter !== null &&
      dominantIndexTip !== undefined &&
      palmCenter.distanceSquared(dominantIndexTip) <
        HANDUI_INTERACTION_DISTANCE_THRESHOLD_CM *
          HANDUI_INTERACTION_DISTANCE_THRESHOLD_CM
    )
  }

  private onDestroy() {
    this.release()
    this.directTargetProvider?.destroy()
    this.indirectTargetProvider?.destroy()
    this.pokeTargetProvider?.destroy()
  }
}
